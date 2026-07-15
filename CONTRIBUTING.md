# Contributing to Flowwright

## Development setup

Use Node.js 24 LTS, pnpm, Python 3.12+, and uv. Run `pnpm install`, then `cd apps/api && uv sync`.

## Branches and commits

Use short branches such as `codex/feature-name` or `fix/issue-name`. Keep commits focused and describe the user-visible behavior. Never commit `.env` files, recordings, uploaded media, databases, or generated secrets.

## Checks

Before opening a pull request, run `pnpm check` and `cd apps/api && uv run pytest`. Add a regression test for behavior changes.

## Pull-request checklist

- [ ] Scope is limited and documented.
- [ ] Frontend lint, typecheck, and build pass.
- [ ] Backend tests pass.
- [ ] Synthetic data only.
- [ ] Security and privacy implications are called out.

Report suspected vulnerabilities privately using the process in `SECURITY.md`.
