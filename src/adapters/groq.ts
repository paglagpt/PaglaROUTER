import type { ChatRequest } from "../types";
import { buildOpenAIPayload, type OpenAICompatiblePayload } from "./openai-generic";

/** Groq LPU adapter — pure OpenAI-compatible passthrough. */
export function groqTransformRequest(req: ChatRequest, routeModel: string): OpenAICompatiblePayload {
  return buildOpenAIPayload(req, routeModel);
}
