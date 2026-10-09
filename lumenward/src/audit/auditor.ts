import { StrKey } from "@stellar/stellar-sdk";

/** The part of a Horizon account response the auditor needs. */
export interface AccountSnapshot {
  address?: string;
  signers: { key: string; weight: number }[];
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
}

export type Severity = "critical" | "warning" | "info" | "ok";

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
}

/** Reads the fields we need from a Horizon account object. Throws a clear error if they are missing. */
export function parseAccountSnapshot(json: unknown): AccountSnapshot {
  const obj = json as Record<string, unknown> | null;
  const signers = obj?.["signers"];
  const thresholds = obj?.["thresholds"] as Record<string, unknown> | undefined;
  if (!Array.isArray(signers) || !thresholds) {
    throw new Error("Input is not an account object: expected 'signers' and 'thresholds'");
  }
  const num = (v: unknown, name: string): number => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error(`Invalid ${name}`);
    return v;
  };
  const snap: AccountSnapshot = {
    signers: signers.map((s, i) => {
      const o = s as Record<string, unknown>;
      if (typeof o["key"] !== "string") throw new Error(`Signer ${i} has no key`);
      return { key: o["key"], weight: num(o["weight"], `weight of signer ${i}`) };
    }),
    thresholds: {
      low_threshold: num(thresholds["low_threshold"], "low_threshold"),
      med_threshold: num(thresholds["med_threshold"], "med_threshold"),
      high_threshold: num(thresholds["high_threshold"], "high_threshold"),
    },
  };
  if (typeof obj?.["id"] === "string") snap.address = obj["id"];
  return snap;
}

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };

/**
 * Checks whether an account's signer set matches a safe multi-party recovery setup.
 *
 * `recoveryKeys` are the signing keys handed out by each recovery server.
 * A signer is judged against the high threshold, because adding or removing
 * signers is a high-threshold operation.
 */
export function auditAccount(account: AccountSnapshot, recoveryKeys: string[]): Finding[] {
  const findings: Finding[] = [];
  const high = account.thresholds.high_threshold;
  const weights = new Map(account.signers.map((s) => [s.key, s.weight]));

  for (const key of recoveryKeys) {
    if (!StrKey.isValidEd25519PublicKey(key)) {
      findings.push({ severity: "warning", code: "invalid-recovery-key", message: `${key} is not a valid G... address` });
    }
  }

  // 1. The same key listed for two servers means one party holds both.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const key of recoveryKeys) {
    if (seen.has(key)) {
      findings.push({
        severity: "critical",
        code: "shared-key",
        message: `${key} is listed more than once. Two servers must never share one signing key.`,
      });
    } else {
      seen.add(key);
      unique.push(key);
    }
  }

  // 2. One server should never be able to act alone.
  let totalWeight = 0;
  for (const key of unique) {
    const weight = weights.get(key);
    if (weight === undefined || weight === 0) {
      findings.push({
        severity: "warning",
        code: "recovery-key-missing",
        message: `${key} is not an active signer on this account (weight 0 or not present).`,
      });
      continue;
    }
    totalWeight += weight;
    if (weight >= high) {
      findings.push({
        severity: "critical",
        code: "single-server-control",
        message: `${key} has weight ${weight}, which meets the high threshold (${high}). That one server can change signers or merge the account alone.`,
      });
    }
  }

  // 3. A single recovery server is effectively a custodian.
  if (unique.length < 2) {
    findings.push({
      severity: "warning",
      code: "single-recovery-server",
      message: `Only ${unique.length} recovery key(s) given. SEP-30 recommends two or more independent servers.`,
    });
  }

  // 4. Together the servers should be able to recover.
  if (unique.length >= 2 && totalWeight < high) {
    findings.push({
      severity: "warning",
      code: "recovery-not-sufficient",
      message: `Recovery keys together have weight ${totalWeight}, below the high threshold (${high}). The servers cannot recover the account without another signer.`,
    });
  }

  if (high === 0) {
    findings.push({
      severity: "info",
      code: "thresholds-default",
      message: "The high threshold is 0. Signer weights have no multi-party effect until thresholds are set.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "ok",
      code: "recovery-set-ok",
      message: `No single server can act alone, and ${unique.length} servers together reach the high threshold (${totalWeight} >= ${high}).`,
    });
  }
  return findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export function hasCritical(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "critical");
}
