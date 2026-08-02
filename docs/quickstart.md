---
layout: default
title: Quickstart
---

# Quickstart

PaglaROUTER is a Cloudflare Worker. Run it locally with Wrangler's KV
emulation, then deploy to the edge.

## Requirements

- Node 20+ (Node 22 recommended)
- npm
- [Cloudflare account](https://dash.cloudflare.com) for deploy (optional for
  local runs)

## Local setup

```bash
npm install
cp .dev.vars.example .dev.vars     # then fill in provider keys
```

> On Windows: `copy .dev.vars.example .dev.vars`

`.dev.vars` is gitignored and never committed. Keys may be comma-separated to
aggregate multiple accounts per provider:

```bash
GEMINI_API_KEY=key1,key2
GROQ_API_KEY=key1
ROUTER_ADMIN_TOKEN=your-optional-token
```

## Run the dev server

```bash
npm run dev
```

Wrangler serves the Worker at `http://localhost:8787` with a local KV
emulation.

## Smoke test

OpenAI-compatible:

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{ "model": "gemini-2.5-flash",
        "messages": [{ "role": "user", "content": "hi" }] }'
```

Anthropic-compatible:

```bash
curl http://localhost:8787/v1/messages \
  -H "Content-Type: application/json" \
  -d '{ "model": "gemini-2.5-flash", "max_tokens": 256,
        "messages": [{ "role": "user", "content": "hi" }] }'
```

## Verify the suite

```bash
npm run typecheck
npm test
npm run build        # wrangler deploy --dry-run
```

## Next steps

- Understand how requests are scored — [Routing & weighting](routing.md)
- See how the pieces fit — [Architecture](architecture.md)
- Ship it — [Development](development.md)
