/**
 * Provider error classification (shared heuristic with the onboarding wizard's
 * `classify_gemini_error` in paglaai_onboard.py). Keep both in sync.
 *
 * Kind vocabulary:
 *   invalid_key           -> the key itself is rejected (401/400 "API key not valid")
 *   key_type_unsupported  -> Gemini "standard"/unrestricted key (rejected since
 *                            Jun 19 2026; all Standard keys ~Sept 2026)
 *   permission            -> 403, token lacks a required scope
 *   rate_limit            -> 429
 *   quota                 -> reserved for explicit quota-exhaustion bodies
 *   server                -> 5xx
 *   other                 -> anything else
 */

export type ProviderErrorKind =
  | "invalid_key"
  | "key_type_unsupported"
  | "permission"
  | "rate_limit"
  | "quota"
  | "server"
  | "other";

export function classifyProviderError(provider: string, status: number, body: string): ProviderErrorKind {
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status === 401) return "invalid_key";
  if (status === 403) return "permission";

  const low = body.toLowerCase();
  if (status === 400 && provider === "gemini") {
    if (low.includes("api key not valid")) return "invalid_key";
    if (
      low.includes("standard") ||
      low.includes("unrestricted") ||
      low.includes("key_type") ||
      low.includes("auth key") ||
      low.includes("apikey type")
    ) {
      return "key_type_unsupported";
    }
    return "other";
  }
  if (status === 400) {
    if (low.includes("invalid") || low.includes("unauthorized")) return "invalid_key";
    return "other";
  }
  return "other";
}
