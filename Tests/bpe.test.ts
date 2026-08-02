import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  contentToText,
  estimatePromptTokens,
  estimateToolTokens,
} from "../src/telemetry/bpe";
import type { ChatMessage } from "../src/types";

describe("estimateTokens", () => {
  it("returns 0 only for the empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("charges whitespace-only input at least 1 token (non-empty)", () => {
    expect(estimateTokens("   ")).toBeGreaterThanOrEqual(1);
  });

  it("charges CJK characters roughly one token each", () => {
    const cjk = estimateTokens("你好世界");
    expect(cjk).toBeGreaterThanOrEqual(4);
  });

  it("always returns at least 1 token for non-empty input", () => {
    expect(estimateTokens("a")).toBeGreaterThanOrEqual(1);
  });

  it("estimates more tokens for longer text", () => {
    const short = estimateTokens("hello world");
    const long = estimateTokens("hello world ".repeat(20));
    expect(long).toBeGreaterThan(short);
  });
});

describe("contentToText", () => {
  it("passes string content through", () => {
    expect(contentToText("hi")).toBe("hi");
  });

  it("joins ContentPart text fields", () => {
    expect(contentToText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a b");
  });
});

describe("estimatePromptTokens", () => {
  it("sums across all messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a router." },
      { role: "user", content: "你好，请总结。" },
      { role: "assistant", content: "Done." },
    ];
    const total = estimatePromptTokens(messages);
    expect(total).toBeGreaterThan(0);
  });

  it("is 0 for an empty message list", () => {
    expect(estimatePromptTokens([])).toBe(0);
  });
});

describe("estimateToolTokens", () => {
  it("counts tool call name and arguments", () => {
    const messages: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "1", type: "function", function: { name: "get_weather", arguments: '{"city":"Dhaka"}' } }],
      },
    ];
    expect(estimateToolTokens(messages)).toBeGreaterThan(0);
  });

  it("ignores messages without tool calls", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "plain" }];
    expect(estimateToolTokens(messages)).toBe(0);
  });
});
