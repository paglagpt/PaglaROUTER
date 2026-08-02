import type { Account } from "../config";
import type { ChatRequest } from "../types";

/**
 * Real-time account state used by the weighting engine.
 */
export interface AccountState {
  /** Health factor H(Ai) in [0,1]; 0 = permanently locked out. */
  H: number;
  /** Circuit breaker S(Ai) in [0,1]; 0 = tripped. */
  S: number;
  /** Concurrent in-flight requests C(Ai). */
  C: number;
  /** Remaining requests per minute within the sliding window. */
  rpmRemaining: number;
  /** Remaining tokens per minute within the sliding window. */
  tpmRemaining: number;
  /** Remaining requests per day within the reset cadence. */
  rpdRemaining: number;
}

/**
 * W(Ai, M) = H(Ai) * S(Ai) *
 *   ( alpha*(Rrpm/Lrpm) + beta*(Rtpm/Ltpm) + gamma*(Rrpd/Lrpd) )
 *   * 1 / (1 + C(Ai))
 *
 * Zero-weight accounts are excluded from selection by the caller.
 */
export function computeWeight(
  account: Account,
  state: AccountState,
  _request: ChatRequest,
  alpha = 0.3,
  beta = 0.4,
  gamma = 0.3,
): number {
  const q = account.quota;
  if (state.H <= 0 || state.S <= 0) return 0;
  if (q.rpm <= 0 || q.tpm <= 0 || q.rpd <= 0) return 0;

  const Rrpm = Math.max(0, state.rpmRemaining);
  const Rtpm = Math.max(0, state.tpmRemaining);
  const Rrpd = Math.max(0, state.rpdRemaining);

  const normalized =
    alpha * (Rrpm / q.rpm) + beta * (Rtpm / q.tpm) + gamma * (Rrpd / q.rpd);

  const W = (state.H * state.S * normalized) / (1 + state.C);
  return Number.isFinite(W) ? W : 0;
}
