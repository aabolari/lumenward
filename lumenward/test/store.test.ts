import { Keypair } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store/memory.js";
import { SqliteStore } from "../src/store/sqlite.js";
import { AccountExistsError, type AccountStore } from "../src/store/store.js";
import type { AccountRecord } from "../src/types.js";

function record(address: string, email?: string): AccountRecord {
  return {
    address,
    identities: [{ role: "owner", auth_methods: [{ type: "stellar_address", value: address }, ...(email ? [{ type: "email", value: email }] : [])] }],
    signingKeys: [{ publicKey: Keypair.random().publicKey(), encryptedSecret: "v1.x.y.z", createdAt: 1 }],
    createdAt: 1,
    updatedAt: 1,
  };
}

const factories: [string, () => AccountStore][] = [
  ["MemoryStore", () => new MemoryStore()],
  ["SqliteStore", () => new SqliteStore(":memory:")],
];

describe.each(factories)("%s contract", (_name, make) => {
  let store: AccountStore;
  const fresh = () => (store = make());
  afterEach(async () => store?.close());

  it("creates and reads back a record", async () => {
    fresh();
    const r = record(Keypair.random().publicKey());
    await store.create(r);
    expect(await store.get(r.address)).toEqual(r);
  });

  it("rejects a duplicate address", async () => {
    fresh();
    const r = record(Keypair.random().publicKey());
    await store.create(r);
    await expect(store.create(r)).rejects.toBeInstanceOf(AccountExistsError);
  });

  it("updates and deletes", async () => {
    fresh();
    const r = record(Keypair.random().publicKey());
    await store.create(r);
    expect(await store.update({ ...r, updatedAt: 99 })).toBe(true);
    expect((await store.get(r.address))?.updatedAt).toBe(99);
    expect(await store.delete(r.address)).toBe(true);
    expect(await store.get(r.address)).toBeUndefined();
    expect(await store.update(r)).toBe(false);
    expect(await store.delete(r.address)).toBe(false);
  });

  it("lists accounts by own address and by identity, ordered, with a cursor", async () => {
    fresh();
    const addrs = [1, 2, 3].map(() => Keypair.random().publicKey()).sort();
    for (const a of addrs) await store.create(record(a, "Shared@Example.com"));
    const other = Keypair.random().publicKey();
    await store.create(record(other));

    // email match is case-insensitive and finds all three, not the fourth
    const byEmail = await store.listAccessible({ methods: [{ type: "email", value: "shared@example.com" }] }, undefined, 10);
    expect(byEmail.map((r) => r.address)).toEqual(addrs);

    const page1 = await store.listAccessible({ methods: [{ type: "email", value: "shared@example.com" }] }, undefined, 2);
    expect(page1.map((r) => r.address)).toEqual(addrs.slice(0, 2));
    const page2 = await store.listAccessible({ methods: [{ type: "email", value: "shared@example.com" }] }, page1[1]?.address, 2);
    expect(page2.map((r) => r.address)).toEqual(addrs.slice(2));

    // the account's own SEP-10 address finds just that account
    const own = await store.listAccessible({ ownAddress: other, methods: [] }, undefined, 10);
    expect(own.map((r) => r.address)).toEqual([other]);
  });

  it("returns nothing for a caller with no matching identity", async () => {
    fresh();
    await store.create(record(Keypair.random().publicKey(), "a@example.com"));
    expect(await store.listAccessible({ methods: [{ type: "email", value: "nobody@example.com" }] }, undefined, 10)).toEqual([]);
    expect(await store.listAccessible({ methods: [] }, undefined, 10)).toEqual([]);
  });

  it("drops old identity lookups when identities are replaced", async () => {
    fresh();
    const r = record(Keypair.random().publicKey(), "old@example.com");
    await store.create(r);
    await store.update({ ...r, identities: [{ role: "owner", auth_methods: [{ type: "email", value: "new@example.com" }] }] });
    expect(await store.listAccessible({ methods: [{ type: "email", value: "old@example.com" }] }, undefined, 10)).toEqual([]);
    expect(await store.listAccessible({ methods: [{ type: "email", value: "new@example.com" }] }, undefined, 10)).toHaveLength(1);
  });
});
