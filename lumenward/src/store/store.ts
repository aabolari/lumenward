import type { AccessQuery, AccountRecord } from "../types.js";

export class AccountExistsError extends Error {
  constructor(address: string) {
    super(`Account ${address} is already registered`);
    this.name = "AccountExistsError";
  }
}

/**
 * Storage contract. Implementations: MemoryStore (tests, demos) and SqliteStore.
 * A Postgres store is a good first contribution. Keep it passing test/store.test.ts.
 */
export interface AccountStore {
  get(address: string): Promise<AccountRecord | undefined>;
  /** Throws AccountExistsError if the address is already registered. */
  create(record: AccountRecord): Promise<void>;
  /** Replaces an existing record. Returns false if it does not exist. */
  update(record: AccountRecord): Promise<boolean>;
  delete(address: string): Promise<boolean>;
  /**
   * Accounts the caller may access, ordered by address, with address > after.
   */
  listAccessible(query: AccessQuery, after: string | undefined, limit: number): Promise<AccountRecord[]>;
  close(): Promise<void>;
}
