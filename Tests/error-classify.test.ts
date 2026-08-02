import { describe, it, expect } from "vitest";
import { classifyProviderError } from "../src/telemetry/error-classify";

describe("classifyProviderError", () => {
  it("maps 429 to rate_limit", () => {
    expect(classifyProviderError("gemini", 429, "")).toBe("rate_limit");
  });

  it("maps 5xx to server", () => {
    expect(classifyProviderError("groq", 500, "")).toBe("server");
    expect(classifyProviderError("qwen", 503, "unavailable")).toBe("server");
  });

  it("maps 401 to invalid_key", () => {
    expect(classifyProviderError("kimi", 401, "")).toBe("invalid_key");
  });

  it("maps 403 to permission", () => {
    expect(classifyProviderError("openrouter", 403, "")).toBe("permission");
  });

  it("detects gemini invalid api key bodies", () => {
    expect(classifyProviderError("gemini", 400, "API key not valid.")).toBe("invalid_key");
  });

  it("detects gemini unsupported standard/unrestricted keys", () => {
    expect(classifyProviderError("gemini", 400, "The user does not have the Standard key")).toBe(
      "key_type_unsupported",
    );
    expect(classifyProviderError("gemini", 400, "apikey type is unrestricted")).toBe(
      "key_type_unsupported",
    );
  });

  it("falls back to other for unknown gemini 400s", () => {
    expect(classifyProviderError("gemini", 400, "some other validation error")).toBe("other");
  });

  it("detects invalid keys in generic 400 bodies", () => {
    expect(classifyProviderError("groq", 400, "Invalid API key provided")).toBe("invalid_key");
    expect(classifyProviderError("qwen", 400, "Unauthorized")).toBe("invalid_key");
  });

  it("returns other as the final fallback", () => {
    expect(classifyProviderError("mistral", 400, "misc")).toBe("other");
    expect(classifyProviderError("cerebras", 418, "teapot")).toBe("other");
  });
});
