/**
 * Real-time x-ratelimit-* header reconciliation.
 *
 * Providers expose their live quota through response headers; these parsed
 * values are reconciled against the local sliding-window counters so the
 * weight engine stays in sync with the true upstream allowance.
 */

export interface RateInfo {
  rpmRemaining?: number;
  tpmRemaining?: number;
  rpdRemaining?: number;
  retryAfter?: number;
  inputTokens?: number;
  outputTokens?: number;
}

function firstNumber(headers: Headers, names: string[]): number | undefined {
  for (const name of names) {
    const v = headers.get(name);
    if (v !== null && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Parse a Retry-After style value: seconds, or an HTTP-date. */
function parseRetryAfter(v: string | null, now = Date.now()): number | undefined {
  if (!v) return undefined;
  const asSeconds = Number(v);
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds);
  const asDate = Date.parse(v);
  if (Number.isFinite(asDate)) return Math.max(0, Math.ceil((asDate - now) / 1000));
  return undefined;
}

export function parseRateLimit(headers: Headers): RateInfo {
  const info: RateInfo = {};

  const rpmRemaining = firstNumber(headers, [
    "x-ratelimit-remaining-requests",
    "ratelimit-remaining-requests",
    "x-ratelimit-remaining",
  ]);
  const tpmRemaining = firstNumber(headers, [
    "x-ratelimit-remaining-tokens",
    "ratelimit-remaining-tokens",
    "ratelimit-remaining-tokens",
  ]);
  const rpdRemaining = firstNumber(headers, [
    "x-ratelimit-remaining-daily",
    "ratelimit-remaining-daily",
  ]);

  if (rpmRemaining !== undefined) info.rpmRemaining = rpmRemaining;
  if (tpmRemaining !== undefined) info.tpmRemaining = tpmRemaining;
  if (rpdRemaining !== undefined) info.rpdRemaining = rpdRemaining;

  const retryAfter = parseRetryAfter(headers.get("retry-after")) ??
    parseRetryAfter(headers.get("x-ratelimit-reset-requests"));
  if (retryAfter !== undefined) info.retryAfter = retryAfter;

  const inputTokens = firstNumber(headers, [
    "x-usage-input-tokens",
    "ratelimit-usage-input-tokens",
    "x-ratelimit-input-tokens",
  ]);
  const outputTokens = firstNumber(headers, [
    "x-usage-output-tokens",
    "ratelimit-usage-output-tokens",
    "x-ratelimit-output-tokens",
  ]);
  if (inputTokens !== undefined) info.inputTokens = inputTokens;
  if (outputTokens !== undefined) info.outputTokens = outputTokens;

  return info;
}

/** Extract usage from an OpenAI-style body. */
export function usageFromBody(body: {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}): { promptTokens: number; completionTokens: number } {
  const usage = body.usage;
  if (!usage) return { promptTokens: 0, completionTokens: 0 };
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  };
}
