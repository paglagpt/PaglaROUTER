# Changelog

All notable changes to PaglaROUTER are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- GitHub Pages docs site (`docs/` Jekyll build) live at
  <https://paglagpt.github.io/PaglaROUTER/>. Built natively from branch `main`
  at path `/docs` (GitHub's own Pages builder), not a custom workflow.
- `ci.yml` workflow (typecheck + tests + dry-run build) for PRs and main.
- `CODE_OF_CONDUCT.md`, `.github/FUNDING.yml`, and Dependabot config for npm
  and GitHub Actions.
- Brand retheme to the official PaglaAI palette (`#6B7EFF` violet on
  `#0A0A0B`), with the *Intelligence Unhinged* tagline in the banner.

### Changed
- Cloudflare `deploy-worker.yml` / `deploy-pages.yml` are now manual
  (`workflow_dispatch`) until the `router.paglaai.space` domain and Cloudflare
  project are live.
- Brand assets moved to `docs/assets/` so the Jekyll docs site can serve them.

## [2.6.0] - 2026-08-02

### Added
- Vitest unit suite under `Tests/` (weight engine, token estimation, rate-limit
  parsing, error classification, sliding-window state, route resolution) with a
  `npm test` script and an in-memory KV mock.
- `assets/banner.svg` and `assets/architecture.svg` in the LengtaMLX design
  language; README rewritten with banner, badges, manifesto quote, quickstart,
  grouped features, and ASCII architecture.
- Markdown docs reference under `docs/` (quickstart, architecture, routing,
  error taxonomy, providers, development).
- `.github/ISSUE_TEMPLATE/bug-report.yml`, `feature-request.yml`, and
  `PULL_REQUEST_TEMPLATE.md`.
- `TASK_PLAN.md` and `.vscode/` editor settings.
- CI now runs `npm test` before deploying the Worker.

### Fixed
- `dailyWindowStart` computed `pacific-midnight`/`cst-midnight` reset
  boundaries via a locale-string round-trip that depended on the host machine's
  timezone. Boundaries are now derived TZ-independently via `Intl` (DST-aware
  for Pacific), so quota windows reset at the correct instant on any host.

## [2.5.0] - 2026-08-02

### Added
- Shared error-classification heuristic (`src/telemetry/error-classify.ts`)
  mirrored with the PaglaAI onboarding wizard: distinguishes invalid keys,
  unsupported key types (e.g. deprecated Gemini "standard" keys), permission
  errors, and upstream failures.
- `invalid_api_key`, `unsupported_key_type`, and `permission_denied` typed
  error responses with permanent lockout for 400 invalid-key / unsupported
  key-type responses.
- Read-only `*_API_KEYS` ecosystem aliases (claude-code-proxy / uni-api
  convention) that fall back when the canonical `*_API_KEY` secret is unset.
- Unified Explorer portal (`public/`) with live gateway + provider telemetry
  dashboard (Cloudflare Pages).

### Changed
- 400 with an invalid key / unsupported key type now locks the account out
  (`H = 0`) instead of retrying a key that can never succeed.
- Primary key selection in the PaglaAI ecosystem prefers the first key in a
  comma-separated `*_API_KEY` value.

## [2.0.0] - 2026-07-10

### Added
- Dual interface: OpenAI-compatible (`/v1/chat/completions`) and
  Anthropic-compatible (`/v1/messages`) with request/response translation.
- Weight-based routing engine `W(Ai, M)` (`src/scheduler/weight.ts`) with
  health factor, circuit breaker, sliding-window quota ratios, and
  concurrency penalty.
- KV-backed token-bucket quota tracking (`src/scheduler/sliding-window.ts`)
  with per-provider rpm / tpm / rpd / tpd windows.
- Provider matrix: Gemini, Groq, DashScope (Qwen), Moonshot (Kimi),
  GitHub Models, Cerebras, Mistral, OpenRouter.
- Multi-account aggregation via comma-separated credentials.
- Error taxonomy cascade: 429 quarantine/requeue, 401/403 lockout,
  circuit-breaker on 5xx.
- Cloudflare Pages explorer portal.

## [1.0.0] - 2026-06-20

### Added
- Initial Cloudflare Worker gateway with Hono router and the Gemini adapter.
