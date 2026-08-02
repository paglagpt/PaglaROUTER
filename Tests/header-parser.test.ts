import { describe, it, expect } from "vitest";
import { parseRateLimit, usageFromBody } from "../src/telemetry/header-parser";

describe("parseRateLimit", () => {
  it("parses rpm/tpm/rpd remaining headers", () => {
    const headers = new Headers({
      "x-ratelimit-remaining-requests": "7",
      "x-ratelimit-remaining-tokens": "120000",
      "x-ratelimit-remaining-daily": "490",
    });
    const info = parseRateLimit(headers);
    expect(info.rpmRemaining).toBe(7);
    expect(info.tpmRemaining).toBe(120000);
    expect(info.rpdRemaining).toBe(490);
  });

  it("reads alternate header names", () => {
    const headers = new Headers({
      "ratelimit-remaining-requests": "3",
      "x-ratelimit-remaining": "8",
    });
    const info = parseRateLimit(headers);
    expect(info.rpmRemaining).toBe(3);
  });

  it("parses retry-after in seconds", () => {
    const info = parseRateLimit(new Headers({ "retry-after": "30" }));
    expect(info.retryAfter).toBe(30);
  });

  it("parses retry-after as an HTTP-date", () => {
    const later = new Date(Date.now() + 60_000).toUTCString();
    const info = parseRateLimit(new Headers({ "retry-after": later }));
    expect(info.retryAfter).toBeGreaterThan(0);
    expect(info.retryAfter).toBeLessThanOrEqual(60);
  });

  it("parses usage token headers", () => {
    const info = parseRateLimit(
      new Headers({ "x-usage-input-tokens": "12", "x-usage-output-tokens": "34" }),
    );
    expect(info.inputTokens).toBe(12);
    expect(info.outputTokens).toBe(34);
  });

  it("returns an empty object when nothing matches", () => {
    expect(parseRateLimit(new Headers({ "x-custom": "1" }))).toEqual({});
  });
});

describe("usageFromBody", () => {
  it("extracts prompt and completion tokens", () => {
    expect(
      usageFromBody({ usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 } }),
    ).toEqual({ promptTokens: 11, completionTokens: 22 });
  });

  it("defaults missing fields to 0", () => {
    expect(usageFromBody({ usage: {} })).toEqual({ promptTokens: 0, completionTokens: 0 });
  });

  it("returns zeros when there is no usage block", () => {
    expect(usageFromBody({})).toEqual({ promptTokens: 0, completionTokens: 0 });
  });
});
