import type { ChatRequest } from "../types";
import { buildOpenAIPayload, type OpenAICompatiblePayload } from "./openai-generic";

/**
 * Alibaba DashScope adapter. DashScope's OpenAI-compatible mode accepts the
 * standard payload; Qwen3+ models additionally take `enable_thinking` to
 * request visible chain-of-thought tokens.
 */
export function qwenTransformRequest(req: ChatRequest, routeModel: string): OpenAICompatiblePayload {
  const payload = buildOpenAIPayload(req, routeModel);
  if (req.thinking === true) {
    payload.enable_thinking = true;
  } else if (req.thinking === false) {
    payload.enable_thinking = false;
  }
  return payload;
}
