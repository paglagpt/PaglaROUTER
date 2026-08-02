import type { ChatRequest } from "./types";

export interface Env {
  PAGLA_TELEMETRY_KV: KVNamespace;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  QWEN_API_KEY?: string;
  KIMI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  CEREBRAS_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  /* Ecosystem aliases (claude-code-proxy / uni-api `*_API_KEYS` convention).
     Read-only: `*_API_KEY` remains the canonical secret. */
  GEMINI_API_KEYS?: string;
  GROQ_API_KEYS?: string;
  QWEN_API_KEYS?: string;
  KIMI_API_KEYS?: string;
  CEREBRAS_API_KEYS?: string;
  MISTRAL_API_KEYS?: string;
  OPENROUTER_API_KEYS?: string;
  ROUTER_ADMIN_TOKEN?: string;
}

export type ResetZone = "utc-midnight" | "rolling" | "pacific-midnight" | "cst-midnight";

export interface Quota {
  rpm: number;
  tpm: number;
  rpd: number;
  tpd?: number;
  reset: ResetZone;
}

export interface ProviderMeta {
  id: string;
  label: string;
  quota: Quota;
  baseUrl: string;
  auth: "bearer" | "x-goog-api-key";
  defaultModel: string;
  models: string[];
  contextCap?: number;
}

export interface Account {
  provider: string;
  accountId: string;
  apiKey: string;
  auth: "bearer" | "x-goog-api-key";
  quota: Quota;
  baseUrl: string;
  model: string;
  contextCap?: number;
  priority: number;
}

export interface Route {
  provider: string;
  model: string;
  priority: number;
}

/**
 * Provider matrix (spec section 4): quota windows, per-account limits,
 * and reset cadence per provider. Multi-account aggregation is achieved
 * by comma-separating keys in the matching Worker secret.
 */
export const PROVIDERS: Record<string, ProviderMeta> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    quota: { rpm: 10, tpm: 250_000, rpd: 500, reset: "pacific-midnight" },
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    auth: "x-goog-api-key",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  },
  groq: {
    id: "groq",
    label: "Groq",
    quota: { rpm: 30, tpm: 20_000, rpd: 14_400, reset: "rolling" },
    baseUrl: "https://api.groq.com/openai/v1",
    auth: "bearer",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama-3.2-3b-preview"],
  },
  qwen: {
    id: "qwen",
    label: "Alibaba DashScope",
    quota: { rpm: 60, tpm: 100_000, rpd: 10_000, reset: "cst-midnight" },
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    auth: "bearer",
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen3-32b"],
  },
  kimi: {
    id: "kimi",
    label: "Moonshot Kimi",
    quota: { rpm: 15, tpm: 60_000, rpd: 5_000, reset: "rolling" },
    baseUrl: "https://api.moonshot.cn/v1",
    auth: "bearer",
    defaultModel: "kimi-k2",
    models: ["kimi-k2", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  github: {
    id: "github",
    label: "GitHub Models",
    quota: { rpm: 10, tpm: 20_000, rpd: 100, reset: "rolling" },
    baseUrl: "https://models.inference.ai.azure.com",
    auth: "bearer",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "o4-mini"],
    contextCap: 8192,
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    quota: { rpm: 10, tpm: 30_000, rpd: 10_000, tpd: 1_000_000, reset: "utc-midnight" },
    baseUrl: "https://api.cerebras.ai/v1",
    auth: "bearer",
    defaultModel: "llama-3.3-70b",
    models: ["llama-3.3-70b", "llama-3.1-8b"],
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    quota: { rpm: 10, tpm: 20_000, rpd: 1_000, reset: "rolling" },
    baseUrl: "https://api.mistral.ai/v1",
    auth: "bearer",
    defaultModel: "open-mistral-nemo",
    models: ["open-mistral-nemo", "mistral-small-latest"],
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    quota: { rpm: 20, tpm: 50_000, rpd: 1_000, reset: "rolling" },
    baseUrl: "https://openrouter.ai/api/v1",
    auth: "bearer",
    defaultModel: "deepseek/deepseek-chat",
    models: ["deepseek/deepseek-chat", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet"],
  },
};

const KEY_ENVS: Record<string, keyof Env> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  qwen: "QWEN_API_KEY",
  kimi: "KIMI_API_KEY",
  github: "GITHUB_TOKEN",
  cerebras: "CEREBRAS_API_KEY",
  mistral: "MISTRAL_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const KEY_ALIASES: Partial<Record<string, keyof Env>> = {
  gemini: "GEMINI_API_KEYS",
  groq: "GROQ_API_KEYS",
  qwen: "QWEN_API_KEYS",
  kimi: "KIMI_API_KEYS",
  cerebras: "CEREBRAS_API_KEYS",
  mistral: "MISTRAL_API_KEYS",
  openrouter: "OPENROUTER_API_KEYS",
};

/**
 * Virtual model name -> ordered cascade of concrete upstream routes.
 * priority 0 is preferred; later entries are failover tiers.
 */
const MODEL_ROUTES: Record<string, Route[]> = {
  "gemini-2.5-flash": [
    { provider: "gemini", model: "gemini-2.5-flash", priority: 0 },
    { provider: "qwen", model: "qwen-plus", priority: 1 },
    { provider: "groq", model: "llama-3.3-70b-versatile", priority: 2 },
  ],
  "gemini-2.5-pro": [
    { provider: "gemini", model: "gemini-2.5-pro", priority: 0 },
    { provider: "openrouter", model: "openai/gpt-4o-mini", priority: 1 },
  ],
  "gpt-4o-mini": [
    { provider: "github", model: "gpt-4o-mini", priority: 0 },
    { provider: "openrouter", model: "openai/gpt-4o-mini", priority: 1 },
  ],
  "gpt-4o": [
    { provider: "github", model: "gpt-4o", priority: 0 },
    { provider: "openrouter", model: "openai/gpt-4o", priority: 1 },
  ],
  "llama-3.3-70b-versatile": [
    { provider: "groq", model: "llama-3.3-70b-versatile", priority: 0 },
    { provider: "cerebras", model: "llama-3.3-70b", priority: 1 },
  ],
  "llama-3.1-8b-instant": [{ provider: "groq", model: "llama-3.1-8b-instant", priority: 0 }],
  "qwen-plus": [{ provider: "qwen", model: "qwen-plus", priority: 0 }],
  "qwen-max": [{ provider: "qwen", model: "qwen-max", priority: 0 }],
  "kimi-k2": [
    { provider: "kimi", model: "kimi-k2", priority: 0 },
    { provider: "qwen", model: "qwen-max", priority: 1 },
  ],
  "deepseek-chat": [
    { provider: "openrouter", model: "deepseek/deepseek-chat", priority: 0 },
    { provider: "qwen", model: "qwen-plus", priority: 1 },
  ],
  "claude-3-5-sonnet": [{ provider: "openrouter", model: "anthropic/claude-3.5-sonnet", priority: 0 }],
};

/**
 * Resolve every concrete account able to serve `request.model` across all
 * configured providers. Falls back to any configured provider default when
 * the requested model matches nothing explicit.
 */
export function resolveRoutes(request: ChatRequest, env: Env): Account[] {
  const accounts = buildAccounts(env);
  if (accounts.length === 0) return [];

  const routes = MODEL_ROUTES[request.model] ?? [];
  const matched: Account[] = [];
  const byKey = new Map(accounts.map((a) => [`${a.provider}:${a.model}`, a]));

  for (const r of routes) {
    const acc = byKey.get(`${r.provider}:${r.model}`);
    if (acc) matched.push({ ...acc, model: r.model, priority: r.priority });
  }
  if (matched.length > 0) return matched;

  // Loose match: provider declares the requested model directly.
  const declared = accounts.filter((a) => PROVIDERS[a.provider]?.models.includes(request.model));
  if (declared.length > 0) return declared.map((a) => ({ ...a, model: request.model, priority: 3 }));

  // Catch-all: any configured provider, using its default model.
  return accounts.map((a) => ({ ...a, priority: 4 }));
}

export function buildAccounts(env: Env): Account[] {
  const accounts: Account[] = [];
  for (const [provider, envKey] of Object.entries(KEY_ENVS)) {
    const meta = PROVIDERS[provider];
    if (!meta) continue;
    const aliasKey = KEY_ALIASES[provider];
    const raw = (env[envKey] as string | undefined) ?? (aliasKey ? (env[aliasKey] as string | undefined) : undefined);
    if (!raw) continue;
    const keys = raw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    keys.forEach((apiKey, i) => {
      accounts.push({
        provider,
        accountId: `${provider}#${i}`,
        apiKey,
        auth: meta.auth,
        quota: meta.quota,
        baseUrl: meta.baseUrl,
        model: meta.defaultModel,
        contextCap: meta.contextCap,
        priority: 0,
      });
    });
  }
  return accounts;
}
