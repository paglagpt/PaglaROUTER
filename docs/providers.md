# Providers

## Quota matrix

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

Reset zones are computed timezone-independently:

- `rolling` — a 24-hour lookback.
- `utc-midnight` — start of the UTC day.
- `pacific-midnight` — start of the LA day (DST-aware).
- `cst-midnight` — start of the Shanghai day (UTC+8, no DST).

## Multi-account aggregation

Comma-separate keys inside one credential to pool quotas into weighted
accounts per provider:

```bash
GEMINI_API_KEY=key1,key2,key3
```

becomes three Google accounts (`gemini#0`, `gemini#1`, `gemini#2`), each
competing on the weight engine. This distributes load across keys and keeps
any single key below its window.

### Ecosystem alias

The `*_API_KEYS` convention (claude-code-proxy / uni-api) is accepted
read-only: `GEMINI_API_KEYS` falls back when `GEMINI_API_KEY` is unset. The
canonical `*_API_KEY` secret always wins.

## Model routes

A virtual model maps to an ordered failover cascade (see
[routing.md](routing.md)). For example `gemini-2.5-flash` prefers Gemini, then
falls back to Qwen, then Groq.

## Key hygiene

- Never commit real keys — `.dev.vars` and all secret vars are gitignored.
- Worker secrets are set with `npx wrangler secret put <NAME> --env production`.
- Gemini "standard" keys are deprecated; the router locks them out — see
  [error-taxonomy.md](error-taxonomy.md).
