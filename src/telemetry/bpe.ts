import type { ChatMessage, ContentPart } from "../types";

/**
 * Fast edge prompt tokenization (BPE approximation).
 *
 * Exact byte-pair encoding is too heavy for a cold Worker start; this
 * heuristic tracks word/char density well enough for quota bookkeeping:
 *   - CJK / full-width characters cost ~1 token each
 *   - everything else costs ~1.3 tokens per whitespace-delimited word,
 *     plus a per-character floor for dense punctuation/code.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch)) cjk++;
    else other++;
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(cjk + words * 1.3 + other / 8));
}

export function contentToText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => part.text ?? "")
    .join(" ");
}

/** Total prompt token estimate across system/user/assistant/tool messages. */
export function estimatePromptTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(contentToText(msg.content));
  }
  return total;
}

/** Overhead for tool schemas when present (tools are tokenized too). */
export function estimateToolTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) total += estimateTokens(tc.function.name + tc.function.arguments);
    }
  }
  return total;
}
