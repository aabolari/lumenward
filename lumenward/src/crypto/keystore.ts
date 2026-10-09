import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * Encrypts signing secrets at rest with AES-256-GCM.
 *
 * Stored format: v1.<iv>.<auth tag>.<ciphertext>  (each part base64)
 * The public key is bound in as additional authenticated data, so a
 * ciphertext cannot be moved to a different key record without detection.
 */
export class KeyStore {
  constructor(private readonly kek: Buffer) {
    if (kek.length !== 32) throw new Error("Key encryption key must be 32 bytes");
  }

  /** Creates a fresh random signing key and returns it with its encrypted secret. */
  generate(): { publicKey: string; encryptedSecret: string } {
    const kp = Keypair.random();
    return { publicKey: kp.publicKey(), encryptedSecret: this.encrypt(kp.secret(), kp.publicKey()) };
  }

  encrypt(secret: string, publicKey: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.kek, iv);
    cipher.setAAD(Buffer.from(publicKey, "utf8"));
    const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
  }

  /** Returns a Keypair. Throws if the data was tampered with or the key is wrong. */
  decrypt(encrypted: string, publicKey: string): Keypair {
    const parts = encrypted.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported key format");
    const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
    const decipher = createDecipheriv("aes-256-gcm", this.kek, Buffer.from(ivB64, "base64"));
    decipher.setAAD(Buffer.from(publicKey, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const secret = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
    const kp = Keypair.fromSecret(secret);
    if (kp.publicKey() !== publicKey) throw new Error("Decrypted key does not match its public key");
    return kp;
  }
}
