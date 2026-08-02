import type { Account } from "../config";
import type { ChatRequest } from "../types";

/**
 * OpenAI-compatible passthrough adapter. Groq, DashScope (qwen), Moonshot
 * (kimi), GitHub Models, Cerebras, Mistral and OpenRouter all expose an
 * OpenAI-flavored `/chat/completions`, so a single generic adapter covers
 * them with per-provider auth + base URL from config.ts.
 */

export interface OpenAICompatiblePayload {
  model: string;
  messages: ChatRequest["messages"];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ChatRequest["tools"];
  stop?: string | string[];
  response_format?: { type: string };
  [key: string]: unknown;
}

/** Build the wire payload, overriding the requested model with the route's. */
export function buildOpenAIPayload(req: ChatRequest, routeModel: string): OpenAICompatiblePayload {
  const payload: OpenAICompatiblePayload = {
    model: routeModel,
    messages: req.messages,
  };
  if (req.temperature !== undefined) payload.temperature = req.temperature;
  if (req.top_p !== undefined) payload.top_p = req.top_p;
  if (req.max_tokens !== undefined) payload.max_tokens = req.max_tokens;
  if (req.stream !== undefined) payload.stream = req.stream;
  if (req.tools && req.tools.length > 0) payload.tools = req.tools;
  if (req.stop !== undefined) payload.stop = req.stop;
  if (req.response_format !== undefined) payload.response_format = req.response_format;
  return payload;
}

export function callOpenAICompatible(
  account: Account,
  req: ChatRequest,
  payload: OpenAICompatiblePayload = buildOpenAIPayload(req, account.model),
): Promise<Response> {
  const url = `${account.baseUrl}/chat/completions`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.apiKey}`,
    },
    body: JSON.stringify(payload),
  });
}
