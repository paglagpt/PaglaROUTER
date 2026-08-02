import type { ChatRequest } from "../types";
import { buildOpenAIPayload, type OpenAICompatiblePayload } from "./openai-generic";

/**
 * Moonshot Kimi adapter. Kimi K2 exposes OpenAI-compatible endpoints and
 * enables thinking-mode via the `thinking` field when extended thinking is
 * requested.
 */
export function kimiTransformRequest(req: ChatRequest, routeModel: string): OpenAICompatiblePayload {
  const payload = buildOpenAIPayload(req, routeModel);
  if (req.thinking === true) {
    payload.thinking = { type: "enabled" };
  }
  return payload;
}
