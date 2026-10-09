# Security policy

Lumenward holds signing keys for other people's Stellar accounts. We take reports seriously.

## Status

Lumenward is **pre-alpha and has not been audited**. Do not use it to protect real mainnet funds.

## Reporting a vulnerability

Please **do not open a public issue**.

1. Use GitHub's private reporting: the **Security** tab, then **Report a vulnerability**.
2. Or email `<your-security-email>`.

Include what you found, how to reproduce it, and what you think the impact is. We aim to reply within 7 days.

## In scope

- Anything that lets a caller read, sign for, change or delete an account they do not own
- Weaknesses in how signing keys are generated, encrypted or stored
- Bypasses of the transaction checks before signing
- Token verification bugs (SEP-10 or external)

## Out of scope

- Findings that need the operator's `KEY_ENCRYPTION_KEY` or host to already be compromised
- Weak identities chosen by the wallet (for example a guessable email). SEP-30 leaves identity strength to the implementer and wallet.
- Reports from automated scanners with no working proof of impact
