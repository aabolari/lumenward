import type { KeyStore } from "../crypto/keystore.js";
import { matchingIdentities, canAccess } from "../store/access.js";
import { AccountExistsError, type AccountStore } from "../store/store.js";
import { parseAndValidate, assertAddress, type SigningPolicy } from "../signing/validate.js";
import { HttpError, type AccessQuery, type AccountRecord, type AccountView, type Principal } from "../types.js";
import { validateIdentities } from "./validation.js";

export const PAGE_SIZE = 50;

function queryFor(principal: Principal): AccessQuery {
  const q: AccessQuery = { methods: principal.methods };
  if (principal.sep10Address) q.ownAddress = principal.sep10Address;
  return q;
}

export class AccountService {
  constructor(
    private readonly store: AccountStore,
    private readonly keys: KeyStore,
    private readonly policy: SigningPolicy,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** POST /accounts/<address>. Only a SEP-10 token for the same account may register it. */
  async register(principal: Principal, address: string, body: unknown): Promise<AccountView> {
    assertAddress(address);
    if (principal.sep10Address !== address) {
      throw new HttpError(401, "A SEP-10 token for this account is required to register it");
    }
    const identities = validateIdentities((body as { identities?: unknown } | undefined)?.identities);
    const key = this.keys.generate();
    const t = this.now();
    const record: AccountRecord = {
      address,
      identities,
      signingKeys: [{ publicKey: key.publicKey, encryptedSecret: key.encryptedSecret, createdAt: t }],
      createdAt: t,
      updatedAt: t,
    };
    try {
      await this.store.create(record);
    } catch (err) {
      if (err instanceof AccountExistsError) throw new HttpError(409, "Account is already registered");
      throw err;
    }
    return this.view(record, principal);
  }

  /** PUT /accounts/<address>. Identities are replaced, not merged. */
  async update(principal: Principal, address: string, body: unknown): Promise<AccountView> {
    const record = await this.requireAccess(principal, address);
    record.identities = validateIdentities((body as { identities?: unknown } | undefined)?.identities);
    record.updatedAt = this.now();
    if (!(await this.store.update(record))) throw new HttpError(404, "Account not found");
    return this.view(record, principal);
  }

  /** GET /accounts/<address> */
  async get(principal: Principal, address: string): Promise<AccountView> {
    return this.view(await this.requireAccess(principal, address), principal);
  }

  /** DELETE /accounts/<address>. The record and its keys are removed for good. */
  async remove(principal: Principal, address: string): Promise<AccountView> {
    const record = await this.requireAccess(principal, address);
    const view = this.view(record, principal);
    await this.store.delete(address);
    return view;
  }

  /** GET /accounts. Cursor paging: pass the last address of the page as `after`. */
  async list(principal: Principal, after: string | undefined): Promise<{ accounts: AccountView[] }> {
    if (after !== undefined && after.length > 128) throw new HttpError(400, "invalid cursor");
    const records = await this.store.listAccessible(queryFor(principal), after, PAGE_SIZE);
    return { accounts: records.map((r) => this.view(r, principal)) };
  }

  /** POST /accounts/<address>/sign/<signing-address> */
  async sign(
    principal: Principal,
    address: string,
    signingAddress: string,
    body: unknown,
  ): Promise<{ signature: string; network_passphrase: string }> {
    const record = await this.requireAccess(principal, address);
    const keyRecord = record.signingKeys.find((k) => k.publicKey === signingAddress);
    if (!keyRecord) throw new HttpError(404, "Signing address not found for this account");

    const xdr = (body as { transaction?: unknown } | undefined)?.transaction;
    if (typeof xdr !== "string" || xdr === "") throw new HttpError(400, "transaction is required");

    const tx = parseAndValidate(xdr, address, this.policy);
    const keypair = this.keys.decrypt(keyRecord.encryptedSecret, keyRecord.publicKey);
    // Sign the transaction hash directly. The signature is 64 bytes (ed25519).
    const signature = Buffer.from(keypair.sign(tx.hash())).toString("base64");
    return {
      signature,
      network_passphrase: this.policy.networkPassphrase,
    };
  }

  /**
   * Adds a new signing key. Old keys stay available so wallets that have not
   * switched yet can still recover. Returns the new public key.
   */
  async rotateSigningKey(address: string): Promise<string> {
    const record = await this.store.get(address);
    if (!record) throw new HttpError(404, "Account not found");
    const key = this.keys.generate();
    const t = this.now();
    record.signingKeys.push({ publicKey: key.publicKey, encryptedSecret: key.encryptedSecret, createdAt: t });
    record.updatedAt = t;
    await this.store.update(record);
    return key.publicKey;
  }

  private async requireAccess(principal: Principal, address: string): Promise<AccountRecord> {
    assertAddress(address);
    const record = await this.store.get(address);
    // SEP-30 asks for 404 whether the account is missing or the caller has no access.
    if (!record || !canAccess(record, queryFor(principal))) throw new HttpError(404, "Account not found");
    return record;
  }

  private view(record: AccountRecord, principal: Principal): AccountView {
    const hits = new Set(matchingIdentities(record, queryFor(principal)));
    return {
      address: record.address,
      identities: record.identities.map((identity, i) => {
        const out: AccountView["identities"][number] = {};
        if (identity.role !== undefined) out.role = identity.role;
        if (hits.has(i)) out.authenticated = true;
        return out;
      }),
      signers: [...record.signingKeys].reverse().map((k) => ({ key: k.publicKey })),
    };
  }
}
