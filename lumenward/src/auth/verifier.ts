import { createLocalJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { JwtSource } from "../config.js";

export type TokenVerifier = (token: string) => Promise<JWTPayload>;

const ASYMMETRIC_ALGS = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"];

/**
 * Builds a verifier for one token issuer.
 * With a key set only asymmetric algorithms are accepted. With a shared
 * secret only HS256 is accepted. This blocks algorithm-confusion attacks.
 */
export function makeVerifier(source: JwtSource): TokenVerifier | undefined {
  const issuer = source.issuer;
  if (source.jwks) {
    const keySet = createLocalJWKSet(JSON.parse(source.jwks));
    return async (token) => {
      const { payload } = await jwtVerify(token, keySet, {
        algorithms: ASYMMETRIC_ALGS,
        requiredClaims: ["exp", "sub"],
        ...(issuer ? { issuer } : {}),
      });
      return payload;
    };
  }
  if (source.secret) {
    const secret = new TextEncoder().encode(source.secret);
    return async (token) => {
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
        requiredClaims: ["exp", "sub"],
        ...(issuer ? { issuer } : {}),
      });
      return payload;
    };
  }
  return undefined;
}
