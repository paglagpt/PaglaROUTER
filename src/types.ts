export type Role = "system" | "user" | "assistant" | "tool";

export interface ContentPart {
  type: "text" | "image_url" | "input_text" | "output_text" | "thinking";
  text?: string;
  image_url?: { url: string };
  thinking?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: ToolDef[];
  stop?: string | string[];
  response_format?: { type: string };
  thinking?: boolean;
}

export interface ChatChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string | null;
}

export interface ChatResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
  thinking?: string;
}
export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicRequest {
  model: string;
  system?: string | Array<{ type: string; text: string }>;
  messages: Array<{
    role: "user" | "assistant";
    content: string | Array<{ type: string; text?: string; image?: { type: string; media_type: string; data: string } }>;
  }>;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  thinking?: { type: string; budget_tokens?: number };
  tools?: Array<{
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
  }>;
}

export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
  model: string;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}
