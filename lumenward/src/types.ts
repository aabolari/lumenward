/**
 * Core data types for Lumenward.
 * Names follow SEP-30 v0.8.1 (identities, auth_methods, signers).
 */

export interface AuthMethod {
  /** "stellar_address", "phone_number", "email", or any implementer-defined type. */
  type: string;
  value: string;
}

export interface Identity {
  /** Echoed back to clients. The server does not interpret it. */
  role?: string;
  auth_methods: AuthMethod[];
}

export interface SigningKeyRecord {
  /** Public key (G...) the wallet adds as an account signer. */
  publicKey: string;
  /** Secret seed encrypted with the key encryption key. See crypto/keystore.ts. */
  encryptedSecret: string;
  createdAt: number;
}

export interface AccountRecord {
  /** The registered Stellar account (G...). */
  address: string;
  identities: Identity[];
  /** Oldest first. The newest key is the last element. */
  signingKeys: SigningKeyRecord[];
  createdAt: number;
  updatedAt: number;
}

/** Who is calling, after the JWT has been verified. */
export interface Principal {
  /** Set when a SEP-10 token proved control of this account. */
  sep10Address?: string;
  /** Identity proofs carried by the token (stellar_address, email, phone_number). */
  methods: AuthMethod[];
}

/** Used to ask the store which accounts a principal may access. */
export interface AccessQuery {
  ownAddress?: string;
  methods: AuthMethod[];
}

/** JSON returned to clients. Identities never include auth methods. */
export interface AccountView {
  address: string;
  identities: { role?: string; authenticated?: boolean }[];
  /** Newest first, as SEP-30 requires. */
  signers: { key: string }[];
}

export class HttpError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409 | 500,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
