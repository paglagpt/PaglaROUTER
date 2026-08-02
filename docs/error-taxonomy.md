---
layout: default
title: Error taxonomy
---

# Error taxonomy

`src/telemetry/error-classify.ts` classifies upstream failures into a small
kind vocabulary, intentionally kept in sync with the PaglaAI onboarding
wizard (`paglaai_onboard.py`). Change both when the taxonomy changes.

## Kinds

| Kind | Trigger | Router action |
| ---- | ------- | ------------- |
| `rate_limit` | `429` | Quarantine until `Retry-After`, requeue |
| `server` | `5xx` | Circuit-breaker increment, jittered backoff |
| `invalid_key` | `401`, or `400` body says the key is invalid | Lockout (`H = 0`) |
| `key_type_unsupported` | Gemini `400` "standard"/"unrestricted" key | Lockout (key can never work) |
| `permission` | `403` | Lockout |
| `quota` | Reserved for explicit quota-exhaustion bodies | — |
| `other` | Anything else | Requeue conservatively |

## Status → kind

```
429            -> rate_limit
>= 500         -> server
401            -> invalid_key
403            -> permission
400 (gemini)   -> invalid_key | key_type_unsupported | other
400 (generic)  -> invalid_key (body mentions invalid/unauthorized) | other
```

## Gemini key types

Google rejects unrestricted "standard" Gemini keys since Jun 19 2026 (all
Standard keys ~Sept 2026). The router classifies these as
`key_type_unsupported` and locks the account out rather than retrying a key
that can never succeed. The onboarding wizard surfaces the same signal during
key validation.

## Requeuing

On failure the Worker picks the next weighted candidate from the cascade
built by `resolveRoutes`. Locked-out (`H = 0`) and tripped (`S = 0`) accounts
are never selected.
