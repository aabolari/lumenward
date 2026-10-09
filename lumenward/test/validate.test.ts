import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { parseAndValidate } from "../src/signing/validate.js";
import { HttpError } from "../src/types.js";
import { PASSPHRASE, buildTx } from "./helpers.js";

const account = Keypair.random().publicKey();
const stranger = Keypair.random().publicKey();
const sponsor = Keypair.random().publicKey();
const policy = { networkPassphrase: PASSPHRASE, allowedSourceAccounts: [sponsor] };

function status(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof HttpError ? e.status : -1;
  }
  return undefined;
}

describe("parseAndValidate", () => {
  it("accepts a transaction sourced from the registered account", () => {
    expect(parseAndValidate(buildTx(account), account, policy).source).toBe(account);
  });

  it("rejects a transaction from another source account", () => {
    expect(status(() => parseAndValidate(buildTx(stranger), account, policy))).toBe(400);
  });

  it("rejects an operation with a foreign source", () => {
    expect(status(() => parseAndValidate(buildTx(account, stranger), account, policy))).toBe(400);
  });

  it("accepts an operation sourced from the registered account", () => {
    expect(() => parseAndValidate(buildTx(account, account), account, policy)).not.toThrow();
  });

  it("accepts an allowed sponsoring account as transaction source", () => {
    expect(() => parseAndValidate(buildTx(sponsor), account, policy)).not.toThrow();
  });

  it("accepts an allowed sponsoring account as operation source", () => {
    expect(() => parseAndValidate(buildTx(account, sponsor), account, policy)).not.toThrow();
  });

  it("rejects fee bump transactions", () => {
    const inner = TransactionBuilder.fromXDR(buildTx(account), PASSPHRASE);
    const feeSource = Keypair.random();
    const bump = TransactionBuilder.buildFeeBumpTransaction(feeSource, "200", inner as never, PASSPHRASE);
    expect(status(() => parseAndValidate(bump.toXDR(), account, policy))).toBe(400);
  });

  it("rejects text that is not a transaction", () => {
    expect(status(() => parseAndValidate("not-xdr", account, policy))).toBe(400);
  });
});
