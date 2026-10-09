import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { AllowedIssuers, Authenticator } from "../auth/authenticator.js";
import type { AccountService } from "../service/accounts.js";
import { HttpError, type Principal } from "../types.js";

export interface ServerDeps {
  service: AccountService;
  auth: Authenticator;
  logLevel?: string | false;
}

const SEP10_ONLY: AllowedIssuers = { sep10: true, external: false };
const ANY: AllowedIssuers = { sep10: true, external: true };

export function buildServer({ service, auth, logLevel = "info" }: ServerDeps): FastifyInstance {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger:
      logLevel === false
        ? false
        : { level: logLevel, redact: ["req.headers.authorization"] },
  });

  const who = (req: FastifyRequest, allowed: AllowedIssuers): Promise<Principal> =>
    auth.authenticate(req.headers.authorization, allowed);

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message });
    const e = err as { statusCode?: number; code?: string };
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(400).send({ error: "invalid request" });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: "internal error" });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: "not found" }));

  // Not part of SEP-30. Lets load balancers and Docker check the process.
  app.get("/healthz", async () => ({ status: "ok" }));

  app.post<{ Params: { address: string } }>("/accounts/:address", async (req) => {
    const principal = await who(req, SEP10_ONLY);
    return service.register(principal, req.params.address, req.body);
  });

  app.put<{ Params: { address: string } }>("/accounts/:address", async (req) => {
    const principal = await who(req, ANY);
    return service.update(principal, req.params.address, req.body);
  });

  app.get<{ Params: { address: string } }>("/accounts/:address", async (req) => {
    const principal = await who(req, ANY);
    return service.get(principal, req.params.address);
  });

  app.delete<{ Params: { address: string } }>("/accounts/:address", async (req) => {
    const principal = await who(req, ANY);
    return service.remove(principal, req.params.address);
  });

  app.get<{ Querystring: { after?: string } }>("/accounts", async (req) => {
    const principal = await who(req, ANY);
    return service.list(principal, req.query.after);
  });

  app.post<{ Params: { address: string; signingAddress: string } }>(
    "/accounts/:address/sign/:signingAddress",
    async (req) => {
      const principal = await who(req, ANY);
      return service.sign(principal, req.params.address, req.params.signingAddress, req.body);
    },
  );

  return app;
}
