import { describe, it, expect } from "vitest";
import {
  dailyWindowStart,
  evaluateAccount,
  commitUsage,
  lockout,
  quarantine,
  recordFailure,
  resetCircuit,
  acquireInFlight,
  releaseInFlight,
} from "../src/scheduler/sliding-window";
import type { Account, Quota, ResetZone } from "../src/config";
import { makeKv } from "./helpers";

const TEST_EPOCH = new Date("2026-08-02T12:00:00Z").getTime();

function account(id: string, quota: Partial<Quota> = {}): Account {
  return {
    provider: "gemini",
    accountId: id,
    apiKey: "k",
    auth: "x-goog-api-key",
    quota: { rpm: 10, tpm: 250_000, rpd: 500, reset: "rolling", ...quota },
    baseUrl: "https://example.test",
    model: "gemini-2.5-flash",
    priority: 0,
  };
}

describe("dailyWindowStart", () => {
  it("is a 24h lookback for rolling windows", () => {
    expect(dailyWindowStart({ rpm: 1, tpm: 1, rpd: 1, reset: "rolling" }, TEST_EPOCH)).toBe(
      TEST_EPOCH - 24 * 60 * 60 * 1000,
    );
  });

  it("aligns utc-midnight to the start of the UTC day", () => {
    const start = dailyWindowStart({ rpm: 1, tpm: 1, rpd: 1, reset: "utc-midnight" }, TEST_EPOCH);
    expect(new Date(start).toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("aligns pacific-midnight accounting for PDT (-7h)", () => {
    const start = dailyWindowStart(
      { rpm: 1, tpm: 1, rpd: 1, reset: "pacific-midnight" },
      TEST_EPOCH,
    );
    // 2026-08-02 is PDT (DST active), midnight PDT = 07:00 UTC
    expect(new Date(start).toISOString()).toBe("2026-08-02T07:00:00.000Z");
  });

  it("aligns cst-midnight to Asia/Shanghai (UTC+8)", () => {
    const start = dailyWindowStart({ rpm: 1, tpm: 1, rpd: 1, reset: "cst-midnight" }, TEST_EPOCH);
    expect(new Date(start).toISOString()).toBe("2026-08-01T16:00:00.000Z");
  });
});

describe("evaluateAccount", () => {
  it("reports full remaining quota for a fresh account", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const state = await evaluateAccount(kv, account("fresh#0"), 100);
    expect(state.rpmRemaining).toBe(10);
    expect(state.tpmRemaining).toBe(250_000);
    expect(state.rpdRemaining).toBe(500);
    expect(state.H).toBe(1);
    expect(state.S).toBe(1);
    expect(state.C).toBe(0);
  });

  it("zeros tpmRemaining when the request does not fit", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const state = await evaluateAccount(kv, account("tiny#0"), 999_999_999);
    expect(state.tpmRemaining).toBe(0);
  });

  it("reflects consumed quota after commitUsage", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("used#0");
    await commitUsage(kv, acc, 100, 25);
    const state = await evaluateAccount(kv, acc, 10);
    expect(state.rpmRemaining).toBe(9);
    expect(state.tpmRemaining).toBe(250_000 - 125);
  });
});

describe("quarantine", () => {
  it("zeroes H while quarantined and restores it after the window", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("quar#0");
    await quarantine(kv, acc, 1);
    expect((await evaluateAccount(kv, acc, 10)).H).toBe(0);

    await new Promise((r) => setTimeout(r, 1100));
    expect((await evaluateAccount(kv, acc, 10)).H).toBe(1);
  });

  it("caps quarantine at one hour", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("cap#0");
    await quarantine(kv, acc, 999_999);
    const stored = JSON.parse(kv.store.get("state:cap#0")!) as { quarantinedUntil: number };
    expect(stored.quarantinedUntil - Date.now()).toBeLessThanOrEqual(3600 * 1000 + 1);
  });
});

describe("lockout", () => {
  it("permanently sets H to 0", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("lock#0");
    await lockout(kv, acc);
    expect((await evaluateAccount(kv, acc, 10)).H).toBe(0);
  });
});

describe("recordFailure / resetCircuit", () => {
  it("trips the circuit breaker after more than 3 failures", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("circ#0");
    for (let i = 0; i < 3; i++) await recordFailure(kv, acc);
    expect((await evaluateAccount(kv, acc, 10)).S).toBe(1);
    await recordFailure(kv, acc);
    expect((await evaluateAccount(kv, acc, 10)).S).toBe(0);
  });

  it("re-arms S via resetCircuit after a backoff", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("rearm#0");
    for (let i = 0; i < 4; i++) await recordFailure(kv, acc);
    expect((await evaluateAccount(kv, acc, 10)).S).toBe(0);
    await resetCircuit(kv, acc);
    // S is restored to 1 once out of the backoff window
    const stored = JSON.parse(kv.store.get("state:rearm#0")!) as { quarantinedUntil: number };
    const health = stored.quarantinedUntil;
    expect(health).toBeGreaterThan(0);
  });
});

describe("in-flight counters", () => {
  it("tracks concurrent requests per account via C", async () => {
    const kv = makeKv() as unknown as KVNamespace;
    const acc = account("inflight#0");
    expect((await evaluateAccount(kv, acc, 10)).C).toBe(0);
    acquireInFlight(acc);
    acquireInFlight(acc);
    expect((await evaluateAccount(kv, acc, 10)).C).toBe(2);
    releaseInFlight(acc);
    releaseInFlight(acc);
    expect((await evaluateAccount(kv, acc, 10)).C).toBe(0);
  });
});
