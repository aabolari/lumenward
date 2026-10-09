import { FeeBumpTransaction, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { HttpError } from "../types.js";

export interface SigningPolicy {
  networkPassphrase: string;
  /**
   * Extra source accounts a transaction may use besides the registered account,
   * for example a sponsoring account (CAP-33). The operator must make sure the
   * server's signing keys are never signers of these accounts.
   */
  allowedSourceAccounts: string[];
}

/**
 * Parses and checks a transaction before the server signs it.
 *
 * Rules (SEP-30, "POST /accounts/<address>/sign/<signing-address>"):
 *  - the transaction source must be the registered account or an allowed account
 *  - every operation source must be unset, the registered account, or an allowed account
 *
 * Fee-bump transactions are rejected.
 */
export function parseAndValidate(xdr: string, accountAddress: string, policy: SigningPolicy): Transaction {
  let parsed: Transaction | FeeBumpTransaction;
  try {
    parsed = TransactionBuilder.fromXDR(xdr, policy.networkPassphrase);
  } catch {
    throw new HttpError(400, "transaction is not a valid base64 XDR transaction envelope");
  }
  if (parsed instanceof FeeBumpTransaction) {
    throw new HttpError(400, "fee bump transactions are not supported");
  }

  const allowed = new Set([accountAddress, ...policy.allowedSourceAccounts]);

  if (!allowed.has(parsed.source)) {
    throw new HttpError(400, "transaction source account is not allowed");
  }
  for (const op of parsed.operations) {
    if (op.source !== undefined && !allowed.has(op.source)) {
      throw new HttpError(400, "an operation source account is not allowed");
    }
  }
  return parsed;
}

export function assertAddress(address: string): void {
  if (!StrKey.isValidEd25519PublicKey(address)) throw new HttpError(400, "invalid Stellar address");
}
