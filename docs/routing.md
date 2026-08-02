# Routing & weighting

## Selection weight

Every candidate account is scored per request:

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

Accounts with `W = 0` are excluded. The highest weight is dispatched first;
failures cascade to the next candidate.

## Route resolution

`src/config.ts` maps a virtual model name to an ordered cascade of concrete
upstream routes:

```ts
"gemini-2.5-flash": [
  { provider: "gemini", model: "gemini-2.5-flash", priority: 0 },
  { provider: "qwen", model: "qwen-plus", priority: 1 },
  { provider: "groq", model: "llama-3.3-70b-versatile", priority: 2 },
]
```

`resolveRoutes` returns, in order:

1. Every cascade tier whose provider has a configured key.
2. Otherwise, any provider that declares the requested model directly
   (loose match).
3. Otherwise, every configured provider's default model (catch-all).

## State inputs

`evaluateAccount` merges quota usage with health/circuit state:

- `rpmRemaining` / `tpmRemaining` / `rpdRemaining` — derived from the KV
  bucket after rolling the window forward.
- A pending request that doesn't fit the TPM window is a zero-weight
  candidate (`tpmRemaining = 0`).
- `H = 0` while quarantined; `S = 0` once circuit failures exceed 3.

## Failover semantics

| Condition | Router action |
| --------- | ------------- |
| `429` | Parse `Retry-After`, quarantine, requeue to next candidate |
| `401` / `403` | `H(Ai) = 0` — permanent lockout |
| `400` invalid/unsupported key | Classified; lockout (key can never work) |
| `5xx` | Increment circuit counter; trip `S = 0` after >3, jittered backoff |
