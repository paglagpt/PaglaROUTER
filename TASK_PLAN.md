# PaglaROUTER — TASK_PLAN

Execution plan for aligning PaglaROUTER's docs/branding/packaging surface with
the LengtaMLX design system, without touching the production routing flow.

**Status:** ✅ Complete — v2.6.0

---

## Workstream A — Docs & brand

| File | Change | Est. time | Est. tokens | Sub-agent | Success | Error | Handoff |
| ---- | ------ | --------- | ----------- | --------- | ------- | ----- | ------- |
| `assets/banner.svg` | LengtaMLX-style banner (navy/cyan, tagline, node motif) | 10m | 300 | — | Renders at width 1200 | Broken SVG → re-emit | README |
| `assets/architecture.svg` | Pipeline diagram (clients → worker → scheduler → KV/providers) | 10m | 300 | — | Renders, matches ASCII block | Broken SVG → re-emit | README, docs |
| `README.md` | Rewrite: banner, badges, manifesto quote, quickstart, grouped features, ASCII architecture; keep provider matrix/error taxonomy/deploy | 30m | 2.5k | — | All facts preserved, links resolve | Fact drift → diff against prior README | CHANGELOG |
| `docs/*.md` | Markdown reference (quickstart, architecture, routing, errors, providers, development) | 45m | 4k | — | Every module referenced is real | Stale path → grep `src/` | CONTRIBUTING |
| `.github/ISSUE_TEMPLATE/*.yml` + `PULL_REQUEST_TEMPLATE.md` | Bug/feature templates + PR checklist | 15m | 800 | — | Valid YAML, PR checks match CI | YAML error → validate | deploy-worker.yml |

## Workstream B — Tests, tooling & packaging

| File | Change | Est. time | Est. tokens | Sub-agent | Success | Error | Handoff |
| ---- | ------ | --------- | ----------- | --------- | ------- | ----- | ------- |
| `Tests/*.test.ts` + `Tests/helpers.ts` | Vitest unit suite (weight, bpe, header-parser, error-classify, sliding-window, config) | 1h | 4.5k | — | `npm test` 59 passing | Failed assertion → fix test or bug | package.json |
| `vitest.config.ts` | Node env, `Tests/**/*.test.ts` include | 5m | 150 | — | `npm test` green | — | package.json |
| `package.json` | Add `vitest`, `"test": "vitest run"`; bump 2.5.0 → 2.6.0 | 5m | 100 | — | `npm ci` + test green | Dep resolution → bump pin | CHANGELOG |
| `src/scheduler/sliding-window.ts` | **Bugfix:** TZ-independent `dailyWindowStart` for pacific/cst midnight (Intl, no locale-string round-trip) | 15m | 400 | — | Reset boundary exact in any host TZ; tests pass | Edge TZ date → property tests | tests, CHANGELOG |
| `TASK_PLAN.md` | This file (LengtaMLX field-table format) | 10m | 300 | — | Mirrors LengtaMLX layout | — | README |
| `.vscode/` | Editor settings + extension recommendations | 5m | 100 | — | Loads without error | — | .gitignore |
| `.github/workflows/deploy-worker.yml` | Add `npm test` step to CI | 5m | 100 | — | CI runs tests | — | CONTRIBUTING |
| `CHANGELOG.md`, `CONTRIBUTING.md`, `.gitignore` | 2.6.0 entry, Tests/docs guidance, allow `.vscode/settings.json` | 15m | 600 | — | Entries consistent with repo | — | README |

## Not in scope (production flow)

- `src/index.ts`, `src/adapters/*`, `src/types.ts`, `public/*`, `wrangler.toml`
  are **not** modified except the `dailyWindowStart` correctness fix above.
- Docusaurus docs site is deferred: wiring `@cloudflare/pages-plugin-docusaurus`
  would add heavy deps to CI `npm ci` and risk the Pages/Worker deploy. The
  `docs/` markdown reference ships now; layer Docusaurus on top later.

## Verification

- `npm test` — 6 files, 59 tests passing
- `npm run typecheck` — clean under `strict`
- `npm run build` — dry-run deploy OK (98.59 KiB / gzip 24.39 KiB)
