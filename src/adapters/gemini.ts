import type { Account } from "../config";
import type { ChatMessage, ChatRequest, ChatResponse, ContentPart, ToolDef } from "../types";

/**
 * Google Gemini REST adapter: translates the canonical OpenAI-style request
 * into the Gemini `generateContent` payload and back.
 */

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: unknown };
}

interface GeminiContent {
  role?: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiPayload {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    thinkingConfig?: { includeThoughts: boolean };
  };
  tools?: Array<{ functionDeclarations: Array<{ name: string; description?: string; parameters?: unknown }> }>;
}

function partToGemini(part: ContentPart): GeminiPart | null {
  if (part.type === "text" || part.type === "input_text" || part.type === "output_text") {
    return { text: part.text ?? "" };
  }
  if (part.type === "image_url" && part.image_url?.url) {
    const m = /^data:(.+?);base64,(.*)$/s.exec(part.image_url.url);
    if (m) return { inlineData: { mimeType: m[1], data: m[2] } };
  }
  return null;
}

function messageToGemini(msg: ChatMessage): GeminiContent {
  const role: GeminiContent["role"] = msg.role === "assistant" ? "model" : "user";
  if (typeof msg.content === "string") {
    return { role, parts: [{ text: msg.content }] };
  }
  const parts = msg.content
    .map(partToGemini)
    .filter((p): p is GeminiPart => p !== null);
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = { raw: tc.function.arguments };
      }
      parts.push({ functionCall: { name: tc.function.name, args } });
    }
  }
  return { role, parts };
}

export function buildGeminiPayload(req: ChatRequest): GeminiPayload {
  const payload: GeminiPayload = { contents: [] };

  const systemText: string[] = [];
  const contents: GeminiContent[] = [];
  for (const msg of req.messages) {
    if (msg.role === "system") {
      const text = typeof msg.content === "string" ? msg.content : msg.content.map((p) => p.text ?? "").join(" ");
      if (text) systemText.push(text);
      continue;
    }
    contents.push(messageToGemini(msg));
  }
  if (systemText.length > 0) {
    payload.systemInstruction = { parts: systemText.map((text) => ({ text })) };
  }
  payload.contents = contents;

  const gc: NonNullable<GeminiPayload["generationConfig"]> = {};
  if (req.temperature !== undefined) gc.temperature = req.temperature;
  if (req.top_p !== undefined) gc.topP = req.top_p;
  if (req.max_tokens !== undefined) gc.maxOutputTokens = req.max_tokens;
  if (req.stop !== undefined) {
    gc.stopSequences = typeof req.stop === "string" ? [req.stop] : req.stop;
  }
  if (req.thinking !== undefined) {
    gc.thinkingConfig = { includeThoughts: req.thinking };
  }
  if (Object.keys(gc).length > 0) payload.generationConfig = gc;

  if (req.tools && req.tools.length > 0) {
    payload.tools = [
      {
        functionDeclarations: req.tools.map((t: ToolDef) => ({
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        })),
      },
    ];
  }
  return payload;
}

export function geminiStreamUrl(account: Account, req: ChatRequest): string {
  const base = `${account.baseUrl}/models/${account.model}:streamGenerateContent`;
  const params = new URLSearchParams({ alt: "sse", key: account.apiKey });
  return `${base}?${params}`;
}

export function callGemini(account: Account, req: ChatRequest): Promise<Response> {
  if (req.stream) {
    return fetch(geminiStreamUrl(account, req), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiPayload(req)),
    });
  }
  const url = `${account.baseUrl}/models/${account.model}:generateContent`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": account.apiKey },
    body: JSON.stringify(buildGeminiPayload(req)),
  });
}

const FINISH_REASON: Record<string, string | null> = {
  STOP: "stop",
  MAX_TOKENS: "length",
  SAFETY: "content_filter",
  FUNCTION_CALL: "tool_calls",
  RECITATION: "content_filter",
  IMAGE_SAFETY: "content_filter",
  PROHIBITED_CONTENT: "content_filter",
  MALFORMED_FUNCTION_CALL: "content_filter",
  OTHER: null,
  UNSPECIFIED: null,
};

export function geminiResponseToChat(raw: unknown, model: string): ChatResponse {
  const r = raw as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[]; role?: string };
      finishReason?: string;
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const candidate = r.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const text = parts.map((p) => p.text ?? "").join("");
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({
      id: `call_${i}`,
      type: "function" as const,
      function: {
        name: p.functionCall!.name,
        arguments: JSON.stringify(p.functionCall!.args ?? {}),
      },
    }));

  const usage = r.usageMetadata;
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: FINISH_REASON[candidate?.finishReason ?? ""] ?? null,
      },
    ],
    usage: {
      prompt_tokens: usage?.promptTokenCount ?? 0,
      completion_tokens: usage?.candidatesTokenCount ?? 0,
      total_tokens: usage?.totalTokenCount ?? 0,
    },
  };
}
