import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { auditAccount, hasCritical, parseAccountSnapshot, type AccountSnapshot } from "../src/audit/auditor.js";

const owner = Keypair.random().publicKey();
const a = Keypair.random().publicKey();
const b = Keypair.random().publicKey();

function snapshot(signers: [string, number][], high = 2): AccountSnapshot {
  return {
    signers: signers.map(([key, weight]) => ({ key, weight })),
    thresholds: { low_threshold: 2, med_threshold: 2, high_threshold: high },
  };
}
const codes = (f: { code: string }[]) => f.map((x) => x.code);

describe("auditAccount", () => {
  it("passes the SEP-30 example setup (two servers, weight 1, threshold 2)", () => {
    const f = auditAccount(snapshot([[owner, 0], [a, 1], [b, 1]]), [a, b]);
    expect(codes(f)).toEqual(["recovery-set-ok"]);
    expect(hasCritical(f)).toBe(false);
  });

  it("flags one server that meets the threshold alone", () => {
    const f = auditAccount(snapshot([[a, 2], [b, 1]]), [a, b]);
    expect(codes(f)).toContain("single-server-control");
    expect(hasCritical(f)).toBe(true);
  });

  it("flags the same key given for two servers", () => {
    const f = auditAccount(snapshot([[a, 1], [b, 1]]), [a, a]);
    expect(codes(f)).toContain("shared-key");
    expect(hasCritical(f)).toBe(true);
  });

  it("warns when only one recovery server is used", () => {
    expect(codes(auditAccount(snapshot([[a, 1]], 1), [a]))).toContain("single-recovery-server");
  });

  it("warns when a recovery key is not an active signer", () => {
    expect(codes(auditAccount(snapshot([[a, 1]]), [a, b]))).toContain("recovery-key-missing");
  });

  it("warns when servers together cannot reach the high threshold", () => {
    expect(codes(auditAccount(snapshot([[a, 1], [b, 1]], 3), [a, b]))).toContain("recovery-not-sufficient");
  });

  it("reports critical findings first", () => {
    const f = auditAccount(snapshot([[a, 5]]), [a]);
    expect(f[0]?.severity).toBe("critical");
  });
});

describe("parseAccountSnapshot", () => {
  it("reads a Horizon style account object", () => {
    const snap = parseAccountSnapshot({
      id: owner,
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 2 },
      signers: [{ key: owner, weight: 1, type: "ed25519_public_key" }],
    });
    expect(snap.address).toBe(owner);
    expect(snap.thresholds.high_threshold).toBe(2);
  });

  it("rejects input that is not an account", () => {
    expect(() => parseAccountSnapshot({ hello: "world" })).toThrow(/signers/);
  });
});
