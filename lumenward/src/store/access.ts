import type { AccessQuery, AccountRecord, AuthMethod } from "../types.js";

/** Normalises a method so lookups are consistent (emails are case-insensitive). */
export function normalizeMethod(m: AuthMethod): AuthMethod {
  const value = m.value.trim();
  return { type: m.type, value: m.type === "email" ? value.toLowerCase() : value };
}

export function methodKey(m: AuthMethod): string {
  const n = normalizeMethod(m);
  return `${n.type}|${n.value}`;
}

/** Returns the identity indexes that match the caller. Empty means no access. */
export function matchingIdentities(record: AccountRecord, query: AccessQuery): number[] {
  const own = query.ownAddress === record.address;
  const callerKeys = new Set(query.methods.map(methodKey));
  const hits: number[] = [];
  record.identities.forEach((identity, i) => {
    if (identity.auth_methods.some((m) => callerKeys.has(methodKey(m)))) hits.push(i);
  });
  // The account's own SEP-10 token always has access, even with no matching identity.
  if (own && hits.length === 0) return [-1];
  return hits;
}

export function canAccess(record: AccountRecord, query: AccessQuery): boolean {
  return matchingIdentities(record, query).length > 0;
}
