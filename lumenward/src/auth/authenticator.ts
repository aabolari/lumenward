import { StrKey } from "@stellar/stellar-sdk";
import type { JWTPayload } from "jose";
import { HttpError, type AuthMethod, type Principal } from "../types.js";
import type { TokenVerifier } from "./verifier.js";

export interface AllowedIssuers {
  sep10: boolean;
  external: boolean;
}

/** SEP-10 subjects look like "G..." or "G...:memo". Only the account part is used. */
export function sep10Principal(payload: JWTPayload): Principal | undefined {
  const sub = payload.sub;
  if (typeof sub !== "string") return undefined;
  const address = sub.split(":")[0] ?? "";
  if (!StrKey.isValidEd25519PublicKey(address)) return undefined;
  return { sep10Address: address, methods: [{ type: "stellar_address", value: address }] };
}

/**
 * External tokens use OpenID Connect claim names: email and phone_number.
 * A claim is ignored if the issuer says it is not verified.
 */
export function externalPrincipal(payload: JWTPayload): Principal | undefined {
  const methods: AuthMethod[] = [];
  const email = payload["email"];
  if (typeof email === "string" && email && payload["email_verified"] !== false) {
    methods.push({ type: "email", value: email });
  }
  const phone = payload["phone_number"];
  if (typeof phone === "string" && phone && payload["phone_number_verified"] !== false) {
    methods.push({ type: "phone_number", value: phone });
  }
  return methods.length > 0 ? { methods } : undefined;
}

export class Authenticator {
  constructor(
    private readonly sep10: TokenVerifier,
    private readonly external: TokenVerifier | undefined,
  ) {}

  async authenticate(authorizationHeader: string | undefined, allowed: AllowedIssuers): Promise<Principal> {
    const token = parseBearer(authorizationHeader);

    if (allowed.sep10) {
      try {
        const principal = sep10Principal(await this.sep10(token));
        if (principal) return principal;
      } catch {
        // fall through to the next issuer
      }
    }
    if (allowed.external && this.external) {
      try {
        const principal = externalPrincipal(await this.external(token));
        if (principal) return principal;
      } catch {
        // fall through
      }
    }
    throw new HttpError(401, "Invalid or expired token");
  }
}

function parseBearer(header: string | undefined): string {
  if (!header) throw new HttpError(401, "Missing Authorization header");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match || !match[1]) throw new HttpError(401, "Authorization header must be a Bearer token");
  return match[1];
}
