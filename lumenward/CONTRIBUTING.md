# Contributing to Lumenward

Thanks for helping. Lumenward holds signing keys, so we review carefully and keep changes small.

## Quick setup

```bash
git clone https://github.com/<your-org>/lumenward.git
cd lumenward
npm install
npm test          # 58+ tests, takes a few seconds
npm run typecheck
```

Requires Node 22.13 or newer. No C++ toolchain is needed.

To run the server locally:

```bash
cp .env.example .env
# fill KEY_ENCRYPTION_KEY with: npm run keygen
# set SEP10_JWT_SECRET to any long string (development only)
npm run dev
npm run token -- --kind sep10 --sub <a G... address>   # mint a test token
```

## How to pick up an issue

1. Find an issue labelled with a complexity (`complexity: trivial`, `complexity: medium` or `complexity: high`).
2. **Comment to ask for assignment. Wait until a maintainer assigns it to you.** Work on unassigned issues may not be accepted.
3. Fork, branch, and make your change.
4. Open a pull request that includes `Closes #<issue-number>` in the description.

## Pull request rules

- One logical change per pull request.
- Add or update tests. `npm test`, `npm run typecheck` and `npm run build` must pass. CI runs the same checks.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`, for example `feat(signing): add operation allow list`.
- Do not commit secrets, `.env` files or database files.
- Keep security-sensitive code simple. If you add a dependency, say why in the pull request.

## Security-sensitive areas

Changes under `src/crypto`, `src/auth`, `src/signing` and `src/store/access.ts` get extra review. Explain the threat you considered in the pull request.

## AI-assisted work

You may use AI tools. You must understand and be able to explain every line you submit, and you must have run the tests. Low-effort, untested or unexplained AI-generated pull requests will be closed. Repeat offences can lead to removal from the program.

## Drips Wave

Issues in this repo follow the Drips Wave format. Maintainers set the final complexity. An issue earns points only when it is assigned to you and closed as completed during an active Wave.

## Reporting security problems

Do not use public issues. See [SECURITY.md](SECURITY.md).
