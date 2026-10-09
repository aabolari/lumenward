import { Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { PASSPHRASE, SEP10_SECRET, bearer, buildTx, externalToken, makeApp, sep10Token } from "./helpers.js";

type App = ReturnType<typeof makeApp>;

describe("SEP-30 API", () => {
  let ctx: App;
  let owner: Keypair;
  let ownerToken: string;
  const identities = [
    { role: "owner", auth_methods: [{ type: "stellar_address", value: "" }] },
    { role: "sender", auth_methods: [{ type: "email", value: "Friend@Example.com" }] },
  ];

  async function register(): Promise<{ signer: string }> {
    const res = await ctx.app.inject({
      method: "POST",
      url: `/accounts/${owner.publicKey()}`,
      headers: bearer(ownerToken),
      payload: { identities },
    });
    expect(res.statusCode).toBe(200);
    return { signer: res.json().signers[0].key };
  }

  beforeEach(async () => {
    ctx = makeApp();
    owner = Keypair.random();
    ownerToken = await sep10Token(owner.publicKey());
    identities[0]!.auth_methods[0]!.value = owner.publicKey();
  });

  describe("registration", () => {
    it("requires a token", async () => {
      const res = await ctx.app.inject({ method: "POST", url: `/accounts/${owner.publicKey()}`, payload: { identities } });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toHaveProperty("error");
    });

    it("rejects a SEP-10 token for a different account", async () => {
      const token = await sep10Token(Keypair.random().publicKey());
      const res = await ctx.app.inject({ method: "POST", url: `/accounts/${owner.publicKey()}`, headers: bearer(token), payload: { identities } });
      expect(res.statusCode).toBe(401);
    });

    it("rejects an external token (only SEP-10 may register)", async () => {
      const token = await externalToken({ email: "friend@example.com" });
      const res = await ctx.app.inject({ method: "POST", url: `/accounts/${owner.publicKey()}`, headers: bearer(token), payload: { identities } });
      expect(res.statusCode).toBe(401);
    });

    it("rejects an expired token and a token signed with the wrong secret", async () => {
      const expired = await sep10Token(owner.publicKey(), SEP10_SECRET, Math.floor(Date.now() / 1000) - 60);
      const wrong = await sep10Token(owner.publicKey(), "another-secret-another-secret-123456");
      for (const token of [expired, wrong]) {
        const res = await ctx.app.inject({ method: "POST", url: `/accounts/${owner.publicKey()}`, headers: bearer(token), payload: { identities } });
        expect(res.statusCode).toBe(401);
      }
    });

    it("registers an account and returns its signing key without leaking auth methods", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}`,
        headers: bearer(ownerToken),
        payload: { identities },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.address).toBe(owner.publicKey());
      expect(body.signers).toHaveLength(1);
      expect(body.signers[0].key).toMatch(/^G[A-Z2-7]{55}$/);
      expect(body.identities).toEqual([{ role: "owner", authenticated: true }, { role: "sender" }]);
      expect(JSON.stringify(body)).not.toContain("example.com");
    });

    it("returns 409 when the account is already registered", async () => {
      await register();
      const res = await ctx.app.inject({ method: "POST", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken), payload: { identities } });
      expect(res.statusCode).toBe(409);
    });

    it("returns 400 for bad identities", async () => {
      const bad = [
        {},
        { identities: [] },
        { identities: [{ auth_methods: [] }] },
        { identities: [{ auth_methods: [{ type: "phone_number", value: "12345" }] }] },
        { identities: [{ auth_methods: [{ type: "email", value: "not-an-email" }] }] },
        { identities: [{ auth_methods: [{ type: "stellar_address", value: "GNOPE" }] }] },
      ];
      for (const payload of bad) {
        const res = await ctx.app.inject({ method: "POST", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken), payload });
        expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      }
    });
  });

  describe("access", () => {
    it("lets the account itself and a matching external identity read it", async () => {
      await register();
      const own = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken) });
      expect(own.statusCode).toBe(200);

      const token = await externalToken({ email: "friend@example.com" });
      const friend = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(token) });
      expect(friend.statusCode).toBe(200);
      // only the matching identity is marked authenticated
      expect(friend.json().identities).toEqual([{ role: "owner" }, { role: "sender", authenticated: true }]);
    });

    it("returns 404 to a caller with no matching identity", async () => {
      await register();
      const token = await externalToken({ email: "stranger@example.com" });
      const res = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(token) });
      expect(res.statusCode).toBe(404);
    });

    it("ignores an email the issuer marks as unverified", async () => {
      await register();
      const token = await externalToken({ email: "friend@example.com", email_verified: false });
      const res = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(token) });
      expect(res.statusCode).toBe(401);
    });

    it("returns 404 for an account that does not exist", async () => {
      const res = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken) });
      expect(res.statusCode).toBe(404);
    });

    it("lists the accounts a caller can access", async () => {
      await register();
      const token = await externalToken({ email: "friend@example.com" });
      const res = await ctx.app.inject({ method: "GET", url: "/accounts", headers: bearer(token) });
      expect(res.statusCode).toBe(200);
      expect(res.json().accounts.map((a: { address: string }) => a.address)).toEqual([owner.publicKey()]);
    });
  });

  describe("update and delete", () => {
    it("replaces identities on PUT", async () => {
      await register();
      const res = await ctx.app.inject({
        method: "PUT",
        url: `/accounts/${owner.publicKey()}`,
        headers: bearer(ownerToken),
        payload: { identities: [{ role: "owner", auth_methods: [{ type: "phone_number", value: "+10000000001" }] }] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().identities).toEqual([{ role: "owner" }]);

      // the old email identity no longer works
      const token = await externalToken({ email: "friend@example.com" });
      const old = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(token) });
      expect(old.statusCode).toBe(404);
    });

    it("deletes an account and then returns 404", async () => {
      await register();
      const del = await ctx.app.inject({ method: "DELETE", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken) });
      expect(del.statusCode).toBe(200);
      expect(del.json().address).toBe(owner.publicKey());
      const get = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken) });
      expect(get.statusCode).toBe(404);
    });
  });

  describe("signing", () => {
    it("signs a valid transaction and the signature verifies", async () => {
      const { signer } = await register();
      const xdr = buildTx(owner.publicKey());
      const res = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}/sign/${signer}`,
        headers: bearer(ownerToken),
        payload: { transaction: xdr },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.network_passphrase).toBe(PASSPHRASE);

      const { TransactionBuilder } = await import("@stellar/stellar-sdk");
      const tx = TransactionBuilder.fromXDR(xdr, PASSPHRASE);
      const ok = Keypair.fromPublicKey(signer).verify(tx.hash(), Buffer.from(body.signature, "base64"));
      expect(ok).toBe(true);
    });

    it("lets a matching external identity request a signature", async () => {
      const { signer } = await register();
      const token = await externalToken({ email: "friend@example.com" });
      const res = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}/sign/${signer}`,
        headers: bearer(token),
        payload: { transaction: buildTx(owner.publicKey()) },
      });
      expect(res.statusCode).toBe(200);
    });

    it("refuses a transaction from a different source account", async () => {
      const { signer } = await register();
      const res = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}/sign/${signer}`,
        headers: bearer(ownerToken),
        payload: { transaction: buildTx(Keypair.random().publicKey()) },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for an unknown signing address and 400 for a missing transaction", async () => {
      const { signer } = await register();
      const unknown = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}/sign/${Keypair.random().publicKey()}`,
        headers: bearer(ownerToken),
        payload: { transaction: buildTx(owner.publicKey()) },
      });
      expect(unknown.statusCode).toBe(404);
      const missing = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}/sign/${signer}`,
        headers: bearer(ownerToken),
        payload: {},
      });
      expect(missing.statusCode).toBe(400);
    });

    it("keeps old signing keys usable after rotation, newest key first", async () => {
      const { signer: oldKey } = await register();
      const newKey = await ctx.service.rotateSigningKey(owner.publicKey());

      const get = await ctx.app.inject({ method: "GET", url: `/accounts/${owner.publicKey()}`, headers: bearer(ownerToken) });
      expect(get.json().signers.map((s: { key: string }) => s.key)).toEqual([newKey, oldKey]);

      for (const key of [newKey, oldKey]) {
        const res = await ctx.app.inject({
          method: "POST",
          url: `/accounts/${owner.publicKey()}/sign/${key}`,
          headers: bearer(ownerToken),
          payload: { transaction: buildTx(owner.publicKey()) },
        });
        expect(res.statusCode).toBe(200);
      }
    });
  });

  describe("errors", () => {
    it("returns JSON errors and 404 for unknown routes", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/nope" });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "not found" });
    });

    it("returns 400 for malformed JSON", async () => {
      const res = await ctx.app.inject({
        method: "POST",
        url: `/accounts/${owner.publicKey()}`,
        headers: { ...bearer(ownerToken), "content-type": "application/json" },
        payload: "{not json",
      });
      expect(res.statusCode).toBe(400);
    });

    it("answers the health check without a token", async () => {
      const res = await ctx.app.inject({ method: "GET", url: "/healthz" });
      expect(res.statusCode).toBe(200);
    });
  });
});
