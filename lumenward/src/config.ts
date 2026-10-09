import { StrKey } from "@stellar/stellar-sdk";

export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export interface JwtSource {
  /** Public key set (JSON text) used to verify tokens. Preferred. */
  jwks?: string;
  /** Shared secret for HS256. Development only. */
  secret?: string;
  issuer?: string;
}

export interface Config {
  host: string;
  port: number;
  networkPassphrase: string;
  store: "memory" | "sqlite";
  databasePath: string;
  /** 32 random bytes. Encrypts signing secrets at rest. */
  keyEncryptionKey: Buffer;
  sep10: JwtSource;
  external: JwtSource;
  allowedSourceAccounts: string[];
  logLevel: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function source(env: Env, prefix: string): JwtSource {
  const out: JwtSource = {};
  const jwks = env[`${prefix}_JWKS`];
  const secret = env[`${prefix}_JWT_SECRET`];
  const issuer = env[`${prefix}_ISSUER`];
  if (jwks) out.jwks = jwks;
  if (secret) out.secret = secret;
  if (issuer) out.issuer = issuer;
  return out;
}

export function loadConfig(env: Env = process.env): Config {
  const keyB64 = required(env, "KEY_ENCRYPTION_KEY");
  const keyEncryptionKey = Buffer.from(keyB64, "base64");
  if (keyEncryptionKey.length !== 32) {
    throw new Error("KEY_ENCRYPTION_KEY must be 32 bytes, base64 encoded. Run: npm run keygen");
  }

  const sep10 = source(env, "SEP10");
  if (!sep10.jwks && !sep10.secret) {
    throw new Error("Set SEP10_JWKS (recommended) or SEP10_JWT_SECRET (development only)");
  }

  const allowedSourceAccounts = (env.ALLOWED_SOURCE_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const a of allowedSourceAccounts) {
    if (!StrKey.isValidEd25519PublicKey(a)) {
      throw new Error(`ALLOWED_SOURCE_ACCOUNTS contains an invalid address: ${a}`);
    }
  }

  const storeName = env.STORE ?? "sqlite";
  if (storeName !== "memory" && storeName !== "sqlite") {
    throw new Error("STORE must be 'memory' or 'sqlite'");
  }

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    host: env.HOST ?? "0.0.0.0",
    port,
    networkPassphrase: env.NETWORK_PASSPHRASE ?? TESTNET_PASSPHRASE,
    store: storeName,
    databasePath: env.DATABASE_PATH ?? "./data/lumenward.db",
    keyEncryptionKey,
    sep10,
    external: source(env, "EXTERNAL"),
    allowedSourceAccounts,
    logLevel: env.LOG_LEVEL ?? "info",
  };
}
