import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { SignJWT } from "jose";
import { buildServer } from "../src/api/server.js";
import { Authenticator } from "../src/auth/authenticator.js";
import { makeVerifier } from "../src/auth/verifier.js";
import { KeyStore } from "../src/crypto/keystore.js";
import { AccountService } from "../src/service/accounts.js";
import { MemoryStore } from "../src/store/memory.js";

export const PASSPHRASE = Networks.TESTNET;
export const SEP10_SECRET = "test-sep10-secret-test-sep10-secret";
export const EXTERNAL_SECRET = "test-external-secret-test-external-secret";

export function newKeyStore(): KeyStore {
  return new KeyStore(Buffer.alloc(32, 7));
}

export async function sep10Token(sub: string, secret = SEP10_SECRET, expires: string | number = "1h"): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(new TextEncoder().encode(secret));
}

export async function externalToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims["email"] ?? claims["phone_number"] ?? "user"))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(EXTERNAL_SECRET));
}

export function makeApp(allowedSourceAccounts: string[] = []) {
  const store = new MemoryStore();
  const service = new AccountService(store, newKeyStore(), { networkPassphrase: PASSPHRASE, allowedSourceAccounts });
  const sep10 = makeVerifier({ secret: SEP10_SECRET });
  const external = makeVerifier({ secret: EXTERNAL_SECRET });
  if (!sep10) throw new Error("no verifier");
  const app = buildServer({ service, auth: new Authenticator(sep10, external), logLevel: false });
  return { app, service, store };
}

/** Builds an unsigned transaction envelope (base64 XDR) for `source`. */
export function buildTx(source: string, opSource?: string): string {
  const extra = Keypair.random().publicKey();
  const op = Operation.setOptions({ signer: { ed25519PublicKey: extra, weight: 1 }, ...(opSource ? { source: opSource } : {}) });
  return new TransactionBuilder(new Account(source, "100"), { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(op)
    .setTimeout(300)
    .build()
    .toXDR();
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
