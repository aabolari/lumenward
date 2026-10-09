import { Authenticator } from "./auth/authenticator.js";
import { makeVerifier } from "./auth/verifier.js";
import { loadConfig } from "./config.js";
import { KeyStore } from "./crypto/keystore.js";
import { buildServer } from "./api/server.js";
import { AccountService } from "./service/accounts.js";
import { MemoryStore } from "./store/memory.js";
import { SqliteStore } from "./store/sqlite.js";
import type { AccountStore } from "./store/store.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const sep10 = makeVerifier(config.sep10);
  if (!sep10) throw new Error("SEP-10 verification is not configured");
  const external = makeVerifier(config.external);

  const store: AccountStore = config.store === "memory" ? new MemoryStore() : new SqliteStore(config.databasePath);
  const service = new AccountService(store, new KeyStore(config.keyEncryptionKey), {
    networkPassphrase: config.networkPassphrase,
    allowedSourceAccounts: config.allowedSourceAccounts,
  });
  const app = buildServer({ service, auth: new Authenticator(sep10, external), logLevel: config.logLevel });

  if (config.sep10.secret || config.external.secret) {
    app.log.warn("A shared JWT secret is configured. This is for development only. Use SEP10_JWKS in production.");
  }
  if (config.store === "memory") app.log.warn("STORE=memory: all accounts are lost when the process stops.");
  app.log.info({ network: config.networkPassphrase }, "Lumenward starting");

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await store.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
