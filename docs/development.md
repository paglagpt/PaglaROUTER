---
layout: default
title: Development
---

# Development

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Wrangler dev server (local KV emulation) |
| `npm test` | Vitest suite under `Tests/` |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm run build` | `wrangler deploy --dry-run --outdir dist` |
| `npm run deploy` | Ship to production (`wrangler deploy --env production`) |

## Layout

```
src/
├── index.ts             # Worker entrypoint & Hono router
├── config.ts            # Provider matrix, quota schema, route resolution
├── scheduler/
│   ├── weight.ts        # W(Ai, M) engine
│   └── sliding-window.ts# KV token bucket + health/circuit state
├── adapters/            # Per-provider REST translation
└── telemetry/           # Token estimation, rate-limit parsing, error classes
Tests/                   # Vitest suite (unit tests for the pure modules)
public/                  # Explorer portal (Cloudflare Pages)
docs/                    # Markdown docs reference
assets/                  # Banner & architecture SVG
```

## Writing tests

Vitest tests live in `Tests/*.test.ts` and target the pure modules:
`weight.ts`, `bpe.ts`, `header-parser.ts`, `error-classify.ts`,
`sliding-window.ts`, and `config.ts`. The KV binding is simulated with the
in-memory mock in `Tests/helpers.ts`.

```ts
import { describe, it, expect } from "vitest";
import { computeWeight } from "../src/scheduler/weight";
```

Run locally with `npm test`.

## Code style

- `strict` TypeScript; no `any` unless unavoidable.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- Prefer small pure functions; the hot path is request routing.
- No comments unless they carry meaning not obvious from the code.

## Conventions

- Keep `src/telemetry/error-classify.ts` in sync with the PaglaAI onboarding
  wizard — change both when the taxonomy changes.
- Update `CHANGELOG.md` for user-visible changes.
- Update README/docs when the surface (endpoints, providers, quotas) changes.

## Deploy

```bash
npx wrangler secret put GEMINI_API_KEY --env production
# ... GROQ_API_KEY, QWEN_API_KEY, KIMI_API_KEY, GITHUB_TOKEN,
#     CEREBRAS_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY
npx wrangler secret put ROUTER_ADMIN_TOKEN --env production
npx wrangler deploy --env production
```

`wrangler.toml` references KV id `a1b2c3d4e5f6_pagla_kv` — create the real
namespace with `npx wrangler kv namespace create PAGLA_TELEMETRY_KV` and paste
its id before deploying.
