import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { AccessQuery, AccountRecord } from "../types.js";
import { canAccess, methodKey } from "./access.js";
import { AccountExistsError, type AccountStore } from "./store.js";

/**
 * SQLite store using Node's built-in `node:sqlite` module, so there is no
 * native build step. Node marks that module experimental and prints a one-time
 * warning at startup. A PostgreSQL store is planned for larger deployments.
 */
export class SqliteStore implements AccountStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        address TEXT PRIMARY KEY,
        data    TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS identity_methods (
        address TEXT NOT NULL REFERENCES accounts(address) ON DELETE CASCADE,
        mkey    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_identity_methods_mkey ON identity_methods(mkey);
    `);
  }

  /** Runs `fn` in one transaction. Rolls back if it throws. */
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private writeMethods(record: AccountRecord): void {
    this.db.prepare("DELETE FROM identity_methods WHERE address = ?").run(record.address);
    const insert = this.db.prepare("INSERT INTO identity_methods (address, mkey) VALUES (?, ?)");
    for (const identity of record.identities) {
      for (const m of identity.auth_methods) insert.run(record.address, methodKey(m));
    }
  }

  async get(address: string): Promise<AccountRecord | undefined> {
    const row = this.db.prepare("SELECT data FROM accounts WHERE address = ?").get(address);
    return row ? (JSON.parse(row["data"] as string) as AccountRecord) : undefined;
  }

  async create(record: AccountRecord): Promise<void> {
    this.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM accounts WHERE address = ?").get(record.address)) {
        throw new AccountExistsError(record.address);
      }
      this.db.prepare("INSERT INTO accounts (address, data) VALUES (?, ?)").run(record.address, JSON.stringify(record));
      this.writeMethods(record);
    });
  }

  async update(record: AccountRecord): Promise<boolean> {
    return this.transaction(() => {
      const res = this.db.prepare("UPDATE accounts SET data = ? WHERE address = ?").run(JSON.stringify(record), record.address);
      if (Number(res.changes) === 0) return false;
      this.writeMethods(record);
      return true;
    });
  }

  async delete(address: string): Promise<boolean> {
    return Number(this.db.prepare("DELETE FROM accounts WHERE address = ?").run(address).changes) > 0;
  }

  async listAccessible(query: AccessQuery, after: string | undefined, limit: number): Promise<AccountRecord[]> {
    const keys = query.methods.map(methodKey);
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (query.ownAddress) {
      clauses.push("a.address = ?");
      params.push(query.ownAddress);
    }
    if (keys.length > 0) {
      clauses.push(`m.mkey IN (${keys.map(() => "?").join(",")})`);
      params.push(...keys);
    }
    if (clauses.length === 0) return [];

    const sql = `
      SELECT DISTINCT a.address, a.data
      FROM accounts a
      LEFT JOIN identity_methods m ON m.address = a.address
      WHERE (${clauses.join(" OR ")}) AND a.address > ?
      ORDER BY a.address
      LIMIT ?`;
    const rows = this.db.prepare(sql).all(...params, after ?? "", limit);
    // Defence in depth: re-check access in code before returning anything.
    return rows.map((r) => JSON.parse(r["data"] as string) as AccountRecord).filter((r) => canAccess(r, query));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
