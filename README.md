# PaglaROUTER

Unified LLM gateway router for the PaglaAI multi-agent ecosystem. A stateless
Cloudflare Worker that presents a single OpenAI (`/v1/chat/completions`) and
Anthropic Claude (`/v1/messages`) interface while dynamically aggregating
multi-account credentials, executing sliding-window rate limiting, and routing
each request across a weighted multi-tier cascade.

## Selection Weight

```
W(Ai, M) = H(Ai) · S(Ai) · ( α·Rrpm/Lrpm + β·Rtpm/Ltpm + γ·Rrpd/Lrpd ) · 1/(1+C(Ai))
```

| Symbol | Meaning |
| ------ | ------- |
| `H` | Health factor; `0` = permanent lockout (401/403) |
| `S` | Circuit breaker; `0` = tripped after >3 consecutive 5xx failures |
| `R/L` | Remaining vs. limit for rpm / tpm / rpd in the sliding window |
| `C` | Concurrent in-flight requests |
| `α, β, γ` | Priority coefficients, default `0.3 / 0.4 / 0.3` (sum = 1.0) |

Accounts with `W = 0` are excluded. The account with the highest weight is
dispatched first; failures cascade to the next weighted candidate.

## Error Taxonomy

| Upstream | Router action |
| -------- | ------------- |
| `429` | Parse `Retry-After` / `x-ratelimit-reset`, quarantine account, requeue to next candidate |
| `401` / `403` | Set `H(Ai) = 0` — permanent lockout for that key |
| `400` invalid key / unsupported key type | Classified via `error-classify.ts`; lockout (the key will never work) |
| `500` / `502` / `503` | Increment circuit-breaker counter; trip `S = 0` after >3, jittered backoff |

## Provider Matrix

| Provider | Credential | Quota window | Reset |
| -------- | ---------- | ------------ | ----- |
| Google Gemini | `GEMINI_API_KEY` | 10 RPM · 250k TPM · 500 RPD | Pacific midnight |
| Groq | `GROQ_API_KEY` | 30 RPM · 20k TPM · 14.4k RPD | Rolling |
| Alibaba DashScope | `QWEN_API_KEY` | 60 RPM · 100k TPM | CST midnight |
| Moonshot Kimi | `KIMI_API_KEY` | 15 RPM · 60k TPM | Rolling |
| GitHub Models | `GITHUB_TOKEN` | 10 RPM · 8k ctx · 100 RPD | Rolling |
| Cerebras | `CEREBRAS_API_KEY` | 10 RPM · 30k TPM · 1M TPD | UTC midnight |
| Mistral | `MISTRAL_API_KEY` | 10 RPM · 20k TPM | Rolling |
| OpenRouter | `OPENROUTER_API_KEY` | 20 RPM · 50k TPM | Rolling |

Comma-separate keys inside one credential to aggregate multiple accounts
(`GEMINI_API_KEY=key1,key2` → two weighted Google accounts). The `*_API_KEYS`
alias (claude-code-proxy / uni-api convention) is also accepted read-only:
`GEMINI_API_KEYS` falls back when `GEMINI_API_KEY` is unset.

## Onboarding & key conventions

Run the PaglaAI onboarding wizard (Python, repo root) to add and live-validate
keys, tag them per account (`GEMINI_API_KEY=k1,k2` + `.env.accounts` email map),
and initialize `.paglaai_state.json`:

```bash
python paglaai_onboard.py check            # pre-flight report
python paglaai_onboard.py wizard           # guided multi-key setup
python paglaai_onboard.py check --report out.md
```

Key-type warning: Google rejects unrestricted "standard" Gemini keys since
Jun 19 2026 (all Standard keys ~Sept 2026). The router classifies these as
`unsupported_key_type` (see `src/telemetry/error-classify.ts`, mirrored in the
wizard) and locks the account out rather than retrying it.

## Directory

```
paglarouter/
├── .github/workflows/       # deploy-worker.yml, deploy-pages.yml
├── public/                  # Explorer portal (Cloudflare Pages)
├── src/
│   ├── index.ts             # Worker entrypoint & Hono router
│   ├── config.ts            # Provider quota & credential schema
│   ├── scheduler/
│   │   ├── weight.ts        # W(Ai, M) engine
│   │   └── sliding-window.ts# KV token bucket + health/circuit state
│   ├── adapters/
│   │   ├── gemini.ts        # Native Google REST translation
│   │   ├── groq.ts          # OpenAI-compat passthrough
│   │   ├── qwen.ts          # DashScope (+ enable_thinking)
│   │   ├── kimi.ts          # Moonshot (+ thinking mode)
│   │   └── openai-generic.ts# GitHub/Cerebras/Mistral/OpenRouter
│   └── telemetry/
│       ├── bpe.ts           # Edge token estimation
│       ├── header-parser.ts # x-ratelimit-* reconciliation
│       └── error-classify.ts# Shared error taxonomy (mirrors the wizard)
├── .dev.vars.example        # Local secret template (copy to .dev.vars)
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                  # MIT
├── SECURITY.md
├── wrangler.toml
└── package.json
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in keys (Windows: copy .dev.vars.example .dev.vars)
npm run typecheck
npm run dev              # wrangler dev (local KV emulation)
```

> `wrangler.toml` references KV id `a1b2c3d4e5f6_pagla_kv`. Create the real
> namespace and paste its id:
> `npx wrangler kv namespace create PAGLA_TELEMETRY_KV`

## Deploy

```bash
npx wrangler deploy --env production
```

Set Worker secrets first (each may hold comma-separated multi-account keys):

```bash
npx wrangler secret put GEMINI_API_KEY --env production
npx wrangler secret put GROQ_API_KEY --env production
# ... QWEN_API_KEY, KIMI_API_KEY, GITHUB_TOKEN, CEREBRAS_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY
npx wrangler secret put ROUTER_ADMIN_TOKEN --env production   # optional auth
```

Once `paglaai.space` NameServers propagate, `https://router.paglaai.space/v1`
activates automatically via the custom-domain route.

## Usage

OpenAI-compatible:

```
POST https://router.paglaai.space/v1/chat/completions
{ "model": "gemini-2.5-flash", "messages": [{ "role": "user", "content": "hi" }] }
```

Anthropic-compatible:

```
POST https://router.paglaai.space/v1/messages
{ "model": "gemini-2.5-flash", "max_tokens": 256, "messages": [{ "role": "user", "content": "hi" }] }
```
