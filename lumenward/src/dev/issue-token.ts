/**
 * DEVELOPMENT ONLY. Mints test JWTs signed with a shared secret so you can try
 * the API without a real SEP-10 server or identity provider.
 *
 *   SEP10_JWT_SECRET=... npm run token -- --kind sep10 --sub G...
 *   EXTERNAL_JWT_SECRET=... npm run token -- --kind external --email me@example.com
 */
import { parseArgs } from "node:util";
import { SignJWT } from "jose";

const { values } = parseArgs({
  options: {
    kind: { type: "string" },
    sub: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    issuer: { type: "string" },
    hours: { type: "string", default: "1" },
  },
});

const kind = values.kind;
if (kind !== "sep10" && kind !== "external") {
  console.error("Use --kind sep10 or --kind external");
  process.exit(2);
}
const secretValue = process.env[kind === "sep10" ? "SEP10_JWT_SECRET" : "EXTERNAL_JWT_SECRET"];
if (!secretValue) {
  console.error(`Set ${kind === "sep10" ? "SEP10_JWT_SECRET" : "EXTERNAL_JWT_SECRET"} first`);
  process.exit(2);
}

const claims: Record<string, unknown> = {};
let subject = values.sub ?? "dev-user";
if (kind === "sep10") {
  if (!values.sub) {
    console.error("--sub <G...> is required for sep10 tokens");
    process.exit(2);
  }
} else {
  if (values.email) claims["email"] = values.email;
  if (values.phone) claims["phone_number"] = values.phone;
  if (!values.email && !values.phone) {
    console.error("Give --email or --phone for external tokens");
    process.exit(2);
  }
  subject = values.email ?? values.phone ?? subject;
}

let jwt = new SignJWT(claims)
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(subject)
  .setIssuedAt()
  .setExpirationTime(`${values.hours}h`);
if (values.issuer) jwt = jwt.setIssuer(values.issuer);

console.log(await jwt.sign(new TextEncoder().encode(secretValue)));
