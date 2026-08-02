import { describe, it, expect } from "vitest";
import { buildAccounts, resolveRoutes } from "../src/config";
import type { Env } from "../src/config";

function env(partial: Partial<Env> = {}): Env {
  return { ...partial } as Env;
}

describe("buildAccounts", () => {
  it("returns no accounts when no keys are set", () => {
    expect(buildAccounts(env())).toEqual([]);
  });

  it("splits comma-separated keys into one account each", () => {
    const accounts = buildAccounts(env({ GEMINI_API_KEY: "key1,key2, key3" }));
    expect(accounts.map((a) => a.apiKey)).toEqual(["key1", "key2", "key3"]);
    expect(accounts.map((a) => a.accountId)).toEqual(["gemini#0", "gemini#1", "gemini#2"]);
  });

  it("prefers the canonical key over the alias", () => {
    const accounts = buildAccounts(env({ GEMINI_API_KEY: "canon", GEMINI_API_KEYS: "alias" }));
    expect(accounts.map((a) => a.apiKey)).toEqual(["canon"]);
  });

  it("falls back to the *_API_KEYS alias when canonical is unset", () => {
    const accounts = buildAccounts(env({ GEMINI_API_KEYS: "alias" }));
    expect(accounts.map((a) => a.apiKey)).toEqual(["alias"]);
  });

  it("builds accounts across multiple providers", () => {
    const accounts = buildAccounts(
      env({ GEMINI_API_KEY: "g", GROQ_API_KEY: "r", GITHUB_TOKEN: "t" }),
    );
    expect(new Set(accounts.map((a) => a.provider))).toEqual(new Set(["gemini", "groq", "github"]));
  });
});

describe("resolveRoutes", () => {
  it("returns an empty list when no providers are configured", () => {
    expect(resolveRoutes({ model: "gemini-2.5-flash" } as never, env())).toEqual([]);
  });

  it("resolves the explicit cascade for a known model", () => {
    const routes = resolveRoutes(
      { model: "gemini-2.5-flash" } as never,
      env({ GEMINI_API_KEY: "g", QWEN_API_KEY: "q", GROQ_API_KEY: "r" }),
    );
    expect(routes.map((r) => `${r.provider}:${r.model}:${r.priority}`)).toEqual([
      "gemini:gemini-2.5-flash:0",
      "qwen:qwen-plus:1",
      "groq:llama-3.3-70b-versatile:2",
    ]);
  });

  it("skips cascade tiers whose provider has no key", () => {
    // gemini-2.5-flash cascade = [gemini:0, qwen:1, groq:2]; only qwen is configured
    const routes = resolveRoutes(
      { model: "gemini-2.5-flash" } as never,
      env({ QWEN_API_KEY: "q" }),
    );
    expect(routes.map((r) => `${r.provider}:${r.model}:${r.priority}`)).toEqual([
      "qwen:qwen-plus:1",
    ]);
  });

  it("loose-matches when a provider declares the model directly", () => {
    const routes = resolveRoutes(
      { model: "qwen-plus" } as never,
      env({ QWEN_API_KEY: "q" }),
    );
    expect(routes.map((r) => `${r.provider}:${r.model}`)).toEqual(["qwen:qwen-plus"]);
  });

  it("falls back to any configured provider default for unknown models", () => {
    const routes = resolveRoutes(
      { model: "brand-new-model" } as never,
      env({ GEMINI_API_KEY: "g", GROQ_API_KEY: "r" }),
    );
    expect(routes).toHaveLength(2);
    expect(routes.every((r) => r.priority === 4)).toBe(true);
  });
});
