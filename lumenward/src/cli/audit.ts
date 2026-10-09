#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { StrKey } from "@stellar/stellar-sdk";
import { auditAccount, hasCritical, parseAccountSnapshot, type Finding } from "../audit/auditor.js";

const USAGE = `lumenward-audit: check a Stellar account's recovery signer set

Usage:
  lumenward-audit <ACCOUNT> --recovery-key <G...> [--recovery-key <G...>] [options]
  lumenward-audit --file account.json --recovery-key <G...> [options]

Options:
  --recovery-key <G...>   Signing key from a recovery server. Repeat once per server.
  --horizon <url>         Horizon base URL (default: https://horizon.stellar.org)
  --file <path>           Read a saved Horizon account JSON instead of fetching
  --json                  Print findings as JSON
  -h, --help              Show this help

Exit codes: 0 no critical findings, 1 critical finding, 2 usage or network error.`;

const ICON: Record<Finding["severity"], string> = { critical: "CRITICAL", warning: "WARNING ", info: "INFO    ", ok: "OK      " };

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "recovery-key": { type: "string", multiple: true },
      horizon: { type: "string", default: "https://horizon.stellar.org" },
      file: { type: "string" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const recoveryKeys = values["recovery-key"] ?? [];
  if (recoveryKeys.length === 0) {
    console.error("Give at least one --recovery-key.\n\n" + USAGE);
    return 2;
  }

  let raw: unknown;
  if (values.file) {
    raw = JSON.parse(readFileSync(values.file, "utf8"));
  } else {
    const address = positionals[0];
    if (!address || !StrKey.isValidEd25519PublicKey(address)) {
      console.error("Give a valid account address (G...) or use --file.\n\n" + USAGE);
      return 2;
    }
    const url = `${values.horizon.replace(/\/$/, "")}/accounts/${address}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Could not fetch ${url}: HTTP ${res.status}`);
      return 2;
    }
    raw = await res.json();
  }

  const findings = auditAccount(parseAccountSnapshot(raw), recoveryKeys);
  if (values.json) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    for (const f of findings) console.log(`${ICON[f.severity]} ${f.code}: ${f.message}`);
  }
  return hasCritical(findings) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
