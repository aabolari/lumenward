import type { AccessQuery, AccountRecord } from "../types.js";
import { canAccess } from "./access.js";
import { AccountExistsError, type AccountStore } from "./store.js";

export class MemoryStore implements AccountStore {
  private readonly accounts = new Map<string, AccountRecord>();

  async get(address: string): Promise<AccountRecord | undefined> {
    const r = this.accounts.get(address);
    return r ? structuredClone(r) : undefined;
  }

  async create(record: AccountRecord): Promise<void> {
    if (this.accounts.has(record.address)) throw new AccountExistsError(record.address);
    this.accounts.set(record.address, structuredClone(record));
  }

  async update(record: AccountRecord): Promise<boolean> {
    if (!this.accounts.has(record.address)) return false;
    this.accounts.set(record.address, structuredClone(record));
    return true;
  }

  async delete(address: string): Promise<boolean> {
    return this.accounts.delete(address);
  }

  async listAccessible(query: AccessQuery, after: string | undefined, limit: number): Promise<AccountRecord[]> {
    return [...this.accounts.values()]
      .filter((r) => (after === undefined || r.address > after) && canAccess(r, query))
      .sort((a, b) => (a.address < b.address ? -1 : 1))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async close(): Promise<void> {}
}
