# Contributing to PaglaROUTER

Thanks for helping build the PaglaAI ecosystem's gateway. This project is a
Cloudflare Worker written in TypeScript, deployed with Wrangler.

## Getting started

```bash
git clone <your-fork-url> paglarouter
cd paglarouter
npm ci
npm run typecheck
npm run dev        # wrangler dev — local KV emulation
```

The project requires Node 20+ (Node 22 recommended) and npm.

## Development workflow

- Create a branch: `git checkout -b feat/your-feature`
- Run `npm run typecheck` before pushing — the CI deploy workflow does the same.
- Keep commits focused; write messages in the imperative mood.
- Rebase onto `main` before opening a PR.

## What belongs where

| Path | Purpose |
| ---- | ------- |
| `src/index.ts` | Worker entrypoint, Hono routes, error cascade |
| `src/config.ts` | Provider matrix, quota schema, route resolution |
| `src/scheduler/` | Weight engine + KV sliding-window state |
| `src/adapters/` | Per-provider REST translation |
| `src/telemetry/` | Token estimation, rate-limit parsing, error classification |
| `public/` | Explorer portal (Cloudflare Pages) |

`src/telemetry/error-classify.ts` is intentionally kept in sync with the
PaglaAI onboarding wizard's key validation — change both when the taxonomy
changes.

## Secrets & credentials

- Never commit real keys. `.dev.vars` and all `*_API_KEY`/`*_API_KEYS`
  variables are gitignored.
- Copy `.dev.vars.example` → `.dev.vars` for local development.
- Worker secrets are set via `npx wrangler secret put <NAME> --env production`.

## Code style

- `strict` TypeScript throughout; no `any` unless absolutely unavoidable.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- Prefer small pure functions; the hot path is request routing.

## Reporting bugs

Open an issue with the upstream status code, provider, model, and the exact
request body (redact keys).
