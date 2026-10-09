import { StrKey } from "@stellar/stellar-sdk";
import { HttpError, type AuthMethod, type Identity } from "../types.js";
import { normalizeMethod } from "../store/access.js";

const MAX_IDENTITIES = 10;
const MAX_METHODS_PER_IDENTITY = 10;
const MAX_VALUE_LENGTH = 256;
const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPE_NAME = /^[a-z0-9_:-]{1,64}$/;

function bad(message: string): never {
  throw new HttpError(400, message);
}

function validateMethod(raw: unknown): AuthMethod {
  if (typeof raw !== "object" || raw === null) bad("each auth method must be an object");
  const { type, value } = raw as Record<string, unknown>;
  if (typeof type !== "string" || !TYPE_NAME.test(type)) bad("auth method type is missing or invalid");
  if (typeof value !== "string" || value.trim() === "" || value.length > MAX_VALUE_LENGTH) {
    bad("auth method value is missing or too long");
  }
  const method = normalizeMethod({ type, value });
  if (type === "stellar_address" && !StrKey.isValidEd25519PublicKey(method.value)) {
    bad("stellar_address must be a valid G... address");
  }
  if (type === "phone_number" && !E164.test(method.value)) {
    bad("phone_number must be in E.164 form, for example +10000000001");
  }
  if (type === "email" && !EMAIL.test(method.value)) bad("email is not a valid address");
  return method;
}

/** Validates the `identities` array from a register or update request. */
export function validateIdentities(input: unknown): Identity[] {
  if (!Array.isArray(input) || input.length === 0) bad("identities must be a non-empty array");
  if (input.length > MAX_IDENTITIES) bad(`at most ${MAX_IDENTITIES} identities are allowed`);

  return input.map((raw): Identity => {
    if (typeof raw !== "object" || raw === null) bad("each identity must be an object");
    const { role, auth_methods } = raw as Record<string, unknown>;
    if (role !== undefined && (typeof role !== "string" || role.length > 64)) bad("role must be a short string");
    if (!Array.isArray(auth_methods) || auth_methods.length === 0) bad("auth_methods must be a non-empty array");
    if (auth_methods.length > MAX_METHODS_PER_IDENTITY) {
      bad(`at most ${MAX_METHODS_PER_IDENTITY} auth methods per identity are allowed`);
    }
    const identity: Identity = { auth_methods: auth_methods.map(validateMethod) };
    if (typeof role === "string") identity.role = role;
    return identity;
  });
}
