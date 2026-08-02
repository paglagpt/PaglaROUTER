import { describe, it, expect } from "vitest";
import { computeWeight, type AccountState } from "../src/scheduler/weight";
import type { Account } from "../src/config";

const baseAccount: Account = {
  provider: "gemini",
  accountId: "gemini#0",
  apiKey: "k",
  auth: "x-goog-api-key",
  quota: { rpm: 10, tpm: 250_000, rpd: 500, reset: "pacific-midnight" },
  baseUrl: "https://example.test",
  model: "gemini-2.5-flash",
  priority: 0,
};

function state(overrides: Partial<AccountState> = {}): AccountState {
  return {
    H: 1,
    S: 1,
    C: 0,
    rpmRemaining: 10,
    tpmRemaining: 250_000,
    rpdRemaining: 500,
    ...overrides,
  };
}

describe("computeWeight", () => {
  it("is positive for a healthy, fully-quota account", () => {
    const w = computeWeight(baseAccount, state(), {} as never);
    expect(w).toBeGreaterThan(0);
    expect(Number.isFinite(w)).toBe(true);
  });

  it("returns 0 when health factor H is 0", () => {
    expect(computeWeight(baseAccount, state({ H: 0 }), {} as never)).toBe(0);
  });

  it("returns 0 when circuit breaker S is 0", () => {
    expect(computeWeight(baseAccount, state({ S: 0 }), {} as never)).toBe(0);
  });

  it("returns 0 when any quota limit is 0", () => {
    const acc = { ...baseAccount, quota: { ...baseAccount.quota, tpm: 0 } };
    expect(computeWeight(acc, state(), {} as never)).toBe(0);
  });

  it("clamps negative remaining to 0", () => {
    const w = computeWeight(baseAccount, state({ rpmRemaining: -5 }), {} as never);
    expect(w).toBeGreaterThanOrEqual(0);
  });

  it("scales down with concurrent in-flight requests", () => {
    const w0 = computeWeight(baseAccount, state({ C: 0 }), {} as never);
    const w3 = computeWeight(baseAccount, state({ C: 3 }), {} as never);
    expect(w3).toBeLessThan(w0);
    expect(w0 / (3 + 1)).toBeCloseTo(w3, 10);
  });

  it("returns 0 instead of NaN/Infinity when remaining explodes", () => {
    const w = computeWeight(
      baseAccount,
      state({ rpmRemaining: Number.MAX_SAFE_INTEGER, tpmRemaining: Infinity }),
      {} as never,
    );
    expect(Number.isFinite(w)).toBe(true);
  });
});
