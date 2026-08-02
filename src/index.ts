import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";

import type { Env, Account } from "./config";
import { PROVIDERS, resolveRoutes } from "./config";
import type {
  AnthropicRequest,
  AnthropicResponse,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ContentPart,
} from "./types";

import { computeWeight } from "./scheduler/weight";
import {
  acquireInFlight,
  commitUsage,
  evaluateAccount,
  lockout,
  quarantine,
  recordFailure,
  releaseInFlight,
  resetCircuit,
} from "./scheduler/sliding-window";
import { estimatePromptTokens } from "./telemetry/bpe";
import { parseRateLimit, usageFromBody } from "./telemetry/header-parser";
import { classifyProviderError } from "./telemetry/error-classify";
import type { ProviderErrorKind } from "./telemetry/error-classify";

import { callGemini, geminiResponseToChat } from "./adapters/gemini";
import { callOpenAICompatible } from "./adapters/openai-generic";
import { groqTransformRequest } from "./adapters/groq";
import { qwenTransformRequest } from "./adapters/qwen";
import { kimiTransformRequest } from "./adapters/kimi";

type AppContext = Context<{ Bindings: Env }>;

/* ------------------------------------------------------------------ */
/* Provider dispatch                                                    */
/* ------------------------------------------------------------------ */

function callProvider(account: Account, request: ChatRequest): Promise<Response> {
  switch (account.provider) {
    case "gemini":
      return callGemini(account, request);
    case "groq":
      return callOpenAICompatible(account, request, groqTransformRequest(request, account.model));
    case "qwen":
      return callOpenAICompatible(account, request, qwenTransformRequest(request, account.model));
    case "kimi":
      return callOpenAICompatible(account, request, kimiTransformRequest(request, account.model));
    default:
      return callOpenAICompatible(account, request);
  }
}

function isOpenAICompatible(provider: string): boolean {
  return provider !== "gemini";
}

function sseResponse(upstream: Response): Response {
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

function errorJson(status: number, message: string, type: string, extra?: Record<string, unknown>): Response {
  return Response.json(
    {
      error: { message, type, ...(extra ?? {}) },
    },
    { status },
  );
}

/**
 * Core routing pipeline: weight-selection, upstream dispatch, and error
 * taxonomy cascade (429 quarantine/requeue, 401/403 lockout, 5xx breaker).
 */
async function routeChat(c: AppContext, request: ChatRequest): Promise<Response> {
  const env = c.env;
  const kv = env.PAGLA_TELEMETRY_KV;
  const promptTokens = estimatePromptTokens(request.messages);

  const accounts = resolveRoutes(request, env);
  if (accounts.length === 0) {
    return errorJson(
      500,
      "No provider credentials configured. Set GEMINI_API_KEY, GROQ_API_KEY, QWEN_API_KEY, KIMI_API_KEY, GITHUB_TOKEN, CEREBRAS_API_KEY, MISTRAL_API_KEY or OPENROUTER_API_KEY (or the *_API_KEYS aliases) as Worker secrets.",
      "configuration_error",
    );
  }

  const evaluated: Array<{ account: Account; weight: number }> = [];
  for (const account of accounts) {
    const state = await evaluateAccount(kv, account, promptTokens);
    const weight = computeWeight(account, state, request);
    if (weight > 0) evaluated.push({ account, weight });
  }
  evaluated.sort((a, b) => b.weight - a.weight || a.account.provider.localeCompare(b.account.provider));

  if (evaluated.length === 0) {
    return errorJson(
      429,
      "All eligible providers are at capacity or quarantined. Try again shortly.",
      "rate_limit_exhausted",
      { retry_after: 30 },
    );
  }

  const tried = new Set<string>();
  let lastError: { status: number; body: string; account: string; kind?: ProviderErrorKind } | null = null;

  for (const { account } of evaluated) {
    if (tried.has(account.accountId)) continue;
    tried.add(account.accountId);

    acquireInFlight(account);
    let upstream: Response;
    try {
      upstream = await callProvider(account, request);
    } catch (err) {
      releaseInFlight(account);
      lastError = { status: 502, body: String(err), account: account.accountId };
      await recordFailure(kv, account);
      continue;
    }
    releaseInFlight(account);

    if (upstream.ok) {
      if (request.stream) return sseResponse(upstream);

      const body = (await upstream.json()) as ChatResponse;
      const usage = usageFromBody(body as { usage?: ChatResponse["usage"] });
      await commitUsage(kv, account, promptTokens, usage.completionTokens || estimateCompletion(body));

      const rate = parseRateLimit(upstream.headers);
      if (rate.retryAfter !== undefined) await resetCircuit(kv, account);

      if (isOpenAICompatible(account.provider)) {
        return Response.json(body, { status: 200 });
      }
      const converted = geminiResponseToChat(body, account.model);
      return Response.json(converted, { status: 200 });
    }

    /* Error taxonomy (spec section 5) */
    const status = upstream.status;
    const rawBody = await upstream.text().catch(() => "");
    const rate = parseRateLimit(upstream.headers);
    const kind = classifyProviderError(account.provider, status, rawBody);

    if (status === 429) {
      await quarantine(kv, account, rate.retryAfter ?? 60);
      lastError = { status, body: rawBody, account: account.accountId, kind };
      continue; // requeue to next weighted candidate
    }
    if (status === 401 || status === 403) {
      await lockout(kv, account); // H(Ai) = 0 permanent
      lastError = { status, body: rawBody, account: account.accountId, kind };
      continue;
    }
    if (status === 400 && (kind === "invalid_key" || kind === "key_type_unsupported")) {
      await lockout(kv, account); // key will never work; do not keep trying it
      lastError = { status, body: rawBody, account: account.accountId, kind };
      continue;
    }
    if (status >= 500) {
      await recordFailure(kv, account); // circuit breaker S(Ai)
      lastError = { status, body: rawBody, account: account.accountId, kind };
      continue;
    }
    lastError = { status, body: rawBody, account: account.accountId, kind };
  }

  if (lastError) {
    const kind = lastError.kind;
    let status: number;
    let type: string;
    if (kind === "invalid_key" || lastError.status === 401) {
      status = 401;
      type = "invalid_api_key";
    } else if (kind === "key_type_unsupported") {
      status = 400;
      type = "unsupported_key_type";
    } else if (kind === "permission" || lastError.status === 403) {
      status = 403;
      type = "permission_denied";
    } else if (lastError.status >= 500) {
      status = 502;
      type = "upstream_error";
    } else if (lastError.status === 429) {
      status = 429;
      type = "rate_limit_exceeded";
    } else {
      status = 429;
      type = "upstream_error";
    }
    return errorJson(status, `Upstream error from ${lastError.account}: ${lastError.body.slice(0, 300)}`, type, {
      upstream_status: lastError.status,
      upstream_account: lastError.account,
    });
  }

  return errorJson(429, "No eligible provider.", "rate_limit_exhausted");
}

function estimateCompletion(body: ChatResponse): number {
  const c = body.choices?.[0]?.message?.content;
  return c ? Math.ceil(c.length / 4) : 0;
}

/* ------------------------------------------------------------------ */
/* Anthropic <-> canonical translation                                  */
/* ------------------------------------------------------------------ */

function anthropicToChat(ar: AnthropicRequest): ChatRequest {
  const messages: ChatMessage[] = [];
  if (ar.system) {
    const sys = typeof ar.system === "string" ? ar.system : ar.system.map((s) => s.text ?? "").join("\n");
    messages.push({ role: "system", content: sys });
  }
  for (const m of ar.messages) {
    if (typeof m.content === "string") {
      messages.push({ role: m.role, content: m.content });
      continue;
    }
    const parts: ContentPart[] = [];
    let toolResult: string | null = null;
    for (const block of m.content) {
      if (block.type === "text" && block.text) parts.push({ type: "text", text: block.text });
      if (block.type === "image" && block.image) {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${block.image.media_type};base64,${block.image.data}` },
        });
      }
      if (block.type === "tool_result" && "content" in block) {
        toolResult = String((block as { content: unknown }).content);
      }
    }
    if (toolResult !== null) {
      messages.push({ role: "tool", content: toolResult });
    } else {
      messages.push({ role: m.role, content: parts });
    }
  }

  const chat: ChatRequest = {
    model: ar.model,
    messages,
    max_tokens: ar.max_tokens,
  };
  if (ar.temperature !== undefined) chat.temperature = ar.temperature;
  if (ar.top_p !== undefined) chat.top_p = ar.top_p;
  if (ar.stream !== undefined) chat.stream = ar.stream;
  if (ar.thinking !== undefined) chat.thinking = ar.thinking.type === "enabled";
  if (ar.tools && ar.tools.length > 0) {
    chat.tools = ar.tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
  return chat;
}

const STOP_REASON: Record<string, string> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  content_filter: "refusal",
};

function chatToAnthropic(cr: ChatResponse, model: string): AnthropicResponse {
  const content: AnthropicResponse["content"] = [];
  const msg = cr.choices?.[0]?.message;
  if (msg?.content) {
    content.push({ type: "text", text: msg.content });
  }
  for (const tc of msg?.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(tc.function.arguments);
    } catch {
      input = { raw: tc.function.arguments };
    }
    content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
  }
  return {
    id: `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    content,
    model,
    stop_reason: STOP_REASON[cr.choices?.[0]?.finish_reason ?? ""] ?? "end_turn",
    usage: {
      input_tokens: cr.usage?.prompt_tokens ?? 0,
      output_tokens: cr.usage?.completion_tokens ?? 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Hono app                                                             */
/* ------------------------------------------------------------------ */

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["POST", "GET", "OPTIONS"] }));

function checkAdmin(c: AppContext): boolean {
  const expected = c.env.ROUTER_ADMIN_TOKEN;
  if (!expected) return true;
  const header = c.req.header("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

app.get("/", (c: AppContext) => {
  const providers = Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    quota: p.quota,
    default_model: p.defaultModel,
    models: p.models,
  }));
  return c.json({ name: "paglarouter-gateway", status: "ok", providers });
});

app.get("/health", (c: AppContext) => {
  const accounts = resolveRoutes({ model: "gemini-2.5-flash", messages: [] }, c.env);
  return c.json({
    ok: true,
    ts: Date.now(),
    configured: accounts.length > 0,
    accounts: accounts.map((a) => a.accountId),
  });
});

app.get("/v1/models", (c: AppContext) => {
  const names = Object.keys(PROVIDERS).flatMap((id) => PROVIDERS[id].models);
  return c.json({ object: "list", data: names.map((id) => ({ id, object: "model", owned_by: "paglarouter" })) });
});

app.post("/v1/chat/completions", async (c: AppContext) => {
  if (!checkAdmin(c)) return errorJson(401, "Missing or invalid ROUTER_ADMIN_TOKEN.", "unauthorized");
  const request = (await c.req.json().catch(() => null)) as ChatRequest | null;
  if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
    return errorJson(400, "Request body must include a non-empty `messages` array.", "invalid_request");
  }
  return routeChat(c, request);
});

app.post("/v1/messages", async (c: AppContext) => {
  if (!checkAdmin(c)) return errorJson(401, "Missing or invalid ROUTER_ADMIN_TOKEN.", "unauthorized");
  const ar = (await c.req.json().catch(() => null)) as AnthropicRequest | null;
  if (!ar || !Array.isArray(ar.messages) || ar.messages.length === 0 || !ar.max_tokens) {
    return errorJson(400, "Request body must include `messages` and `max_tokens`.", "invalid_request");
  }
  if (ar.stream) {
    // SSE passthrough for Anthropic streaming is format-mismatched by design.
    const chat = anthropicToChat(ar);
    return routeChat(c, chat);
  }
  const chat = anthropicToChat(ar);
  const resp = await routeChat(c, chat);
  if (resp.status !== 200) return resp;
  const body = (await resp.json()) as ChatResponse;
  return c.json(chatToAnthropic(body, ar.model));
});

export default app;
