import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { KeyStore } from "../src/crypto/keystore.js";

describe("KeyStore", () => {
  const ks = new KeyStore(Buffer.alloc(32, 1));

  it("round-trips a generated key", () => {
    const { publicKey, encryptedSecret } = ks.generate();
    const kp = ks.decrypt(encryptedSecret, publicKey);
    expect(kp.publicKey()).toBe(publicKey);
  });

  it("never stores the plain secret", () => {
    const kp = Keypair.random();
    const enc = ks.encrypt(kp.secret(), kp.publicKey());
    expect(enc.includes(kp.secret())).toBe(false);
    expect(enc.startsWith("v1.")).toBe(true);
  });

  it("uses a fresh nonce each time", () => {
    const kp = Keypair.random();
    expect(ks.encrypt(kp.secret(), kp.publicKey())).not.toBe(ks.encrypt(kp.secret(), kp.publicKey()));
  });

  it("rejects tampered data", () => {
    const { publicKey, encryptedSecret } = ks.generate();
    const parts = encryptedSecret.split(".");
    const ct = Buffer.from(parts[3] as string, "base64");
    ct[0] = (ct[0] ?? 0) ^ 1;
    parts[3] = ct.toString("base64");
    expect(() => ks.decrypt(parts.join("."), publicKey)).toThrow();
  });

  it("rejects the wrong key encryption key", () => {
    const { publicKey, encryptedSecret } = ks.generate();
    expect(() => new KeyStore(Buffer.alloc(32, 2)).decrypt(encryptedSecret, publicKey)).toThrow();
  });

  it("binds the ciphertext to its public key", () => {
    const { encryptedSecret } = ks.generate();
    const other = Keypair.random().publicKey();
    expect(() => ks.decrypt(encryptedSecret, other)).toThrow();
  });

  it("requires a 32 byte key", () => {
    expect(() => new KeyStore(Buffer.alloc(16))).toThrow();
  });
});
