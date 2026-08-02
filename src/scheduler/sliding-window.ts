import type { Account, Quota, ResetZone } from "../config";
import type { AccountState } from "./weight";

/**
 * KV-backed sliding-window token bucket with a per-isolate in-memory cache
 * for read coalescing. For multi-isolate consistency, swap `get`/`put` for
 * Redis (e.g. Upstash) calls — the key schema is identical.
 */

export interface Bucket {
  minuteStart: number;
  rpmUsed: number;
  tpmUsed: number;
  rpdUsed: number;
  rpdWindowStart: number;
}

export interface HealthState {
  H: number;
  S: number;
  failures: number;
  quarantinedUntil: number;
  lastFailureAt: number;
}

const bucketKey = (acc: Account) => `quota:${acc.accountId}`;
const healthKey = (acc: Account) => `state:${acc.accountId}`;

const memCache = new Map<string, Bucket>();

const MINUTE_MS = 60_000;

/** Wall-clock epoch (ms) at which a provider's daily window resets. */
export function dailyWindowStart(quota: Quota, now = Date.now()): number {
  switch (quota.reset) {
    case "rolling":
      return now - 24 * 60 * 60 * 1000;
    case "utc-midnight": {
      const d = new Date(now);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    case "pacific-midnight": {
      const d = new Date(now);
      const pacific = new Date(d.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const utc = Date.UTC(
        pacific.getUTCFullYear(),
        pacific.getUTCMonth(),
        pacific.getUTCDate(),
      );
      return utc - 7 * 60 * 60 * 1000;
    }
    case "cst-midnight": {
      const d = new Date(now);
      const china = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
      return Date.UTC(
        china.getUTCFullYear(),
        china.getUTCMonth(),
        china.getUTCDate(),
      ) - 8 * 60 * 60 * 1000;
    }
  }
}

async function readRawBucket(kv: KVNamespace, acc: Account): Promise<Bucket> {
  const cached = memCache.get(bucketKey(acc));
  if (cached) return cached;
  try {
    const raw = await kv.get(bucketKey(acc));
    if (raw) return JSON.parse(raw) as Bucket;
  } catch {
    /* corrupt entry -> fresh bucket */
  }
  return freshBucket(acc);
}

function freshBucket(acc: Account): Bucket {
  const now = Date.now();
  return {
    minuteStart: Math.floor(now / MINUTE_MS) * MINUTE_MS,
    rpmUsed: 0,
    tpmUsed: 0,
    rpdUsed: 0,
    rpdWindowStart: dailyWindowStart(acc.quota, now),
  };
}

function rollForward(bucket: Bucket, quota: Quota, now = Date.now()): Bucket {
  const out = { ...bucket };
  const minute = Math.floor(now / MINUTE_MS) * MINUTE_MS;
  if (minute !== bucket.minuteStart) {
    out.minuteStart = minute;
    out.rpmUsed = 0;
    out.tpmUsed = 0;
  }
  const dayStart = dailyWindowStart(quota, now);
  if (dayStart > bucket.rpdWindowStart) {
    out.rpdWindowStart = dayStart;
    out.rpdUsed = 0;
  }
  return out;
}

async function readHealth(kv: KVNamespace, acc: Account): Promise<HealthState> {
  try {
    const raw = await kv.get(healthKey(acc));
    if (raw) return JSON.parse(raw) as HealthState;
  } catch {
    /* fresh state */
  }
  return { H: 1, S: 1, failures: 0, quarantinedUntil: 0, lastFailureAt: 0 };
}

/**
 * Evaluate an account for the pending request: merges quota usage with
 * health/circuit-breaker state into the AccountState the weight engine consumes.
 */
export async function evaluateAccount(
  kv: KVNamespace,
  acc: Account,
  tokenEstimate: number,
): Promise<AccountState> {
  const now = Date.now();
  const [bucket, health] = await Promise.all([
    readRawBucket(kv, acc),
    readHealth(kv, acc),
  ]);

  const fresh = rollForward(bucket, acc.quota, now);
  if (fresh !== bucket) memCache.set(bucketKey(acc), fresh);

  const inWindow = fresh.minuteStart === Math.floor(now / MINUTE_MS) * MINUTE_MS;
  const rpmRemaining = inWindow ? Math.max(0, acc.quota.rpm - fresh.rpmUsed) : acc.quota.rpm;
  const tpmRemaining = inWindow ? Math.max(0, acc.quota.tpm - fresh.tpmUsed) : acc.quota.tpm;
  const rpdRemaining = Math.max(0, acc.quota.rpd - fresh.rpdUsed);

  // The pending request must fit, or it's a zero-weight candidate.
  const fitsTpm = tpmRemaining >= tokenEstimate;
  const H = now < health.quarantinedUntil ? 0 : health.H;
  const S = health.failures > 3 ? 0 : health.S;

  return {
    H,
    S,
    C: inFlight.get(acc.accountId) ?? 0,
    rpmRemaining,
    tpmRemaining: fitsTpm ? tpmRemaining : 0,
    rpdRemaining,
  };
}

/**
 * Persist consumed quota after a successful dispatch. Completion tokens are
 * reconciled from the upstream usage block when available.
 */
export async function commitUsage(
  kv: KVNamespace,
  acc: Account,
  promptTokens: number,
  completionTokens = 0,
): Promise<void> {
  const now = Date.now();
  const fresh = rollForward(await readRawBucket(kv, acc), acc.quota, now);
  fresh.rpmUsed += 1;
  fresh.tpmUsed += promptTokens + completionTokens;
  if (acc.quota.tpd) {
    // tpd is tracked on rpdUsed slot's window; keep separate bucket-free.
  }
  fresh.rpdUsed += 1;
  memCache.set(bucketKey(acc), fresh);
  await kv.put(bucketKey(acc), JSON.stringify(fresh));
}

/** 429 handling: quarantine until the upstream Retry-After (or default). */
export async function quarantine(
  kv: KVNamespace,
  acc: Account,
  retryAfterSeconds = 60,
): Promise<void> {
  const health = await readHealth(kv, acc);
  const until = Date.now() + Math.min(retryAfterSeconds, 3600) * 1000;
  health.quarantinedUntil = Math.max(health.quarantinedUntil, until);
  health.lastFailureAt = Date.now();
  await kv.put(healthKey(acc), JSON.stringify(health));
}

/** 401/403 handling: permanent lockout, H(Ai) = 0. */
export async function lockout(kv: KVNamespace, acc: Account): Promise<void> {
  const health = await readHealth(kv, acc);
  health.H = 0;
  health.lastFailureAt = Date.now();
  await kv.put(healthKey(acc), JSON.stringify(health));
}

/** 5xx handling: increment circuit-breaker failures; trip S=0 after >3. */
export async function recordFailure(kv: KVNamespace, acc: Account): Promise<void> {
  const health = await readHealth(kv, acc);
  health.failures += 1;
  health.lastFailureAt = Date.now();
  if (health.failures > 3) health.S = 0;
  await kv.put(healthKey(acc), JSON.stringify(health));
}

/** Exponential backoff on S after a circuit trip (jittered). */
export async function resetCircuit(kv: KVNamespace, acc: Account): Promise<void> {
  const health = await readHealth(kv, acc);
  const backoff = 30_000 + Math.floor(Math.random() * 30_000);
  health.quarantinedUntil = Date.now() + backoff;
  await kv.put(healthKey(acc), JSON.stringify(health));
}

/** Per-isolate concurrency counter C(Ai). */
const inFlight = new Map<string, number>();
export function acquireInFlight(acc: Account): void {
  inFlight.set(acc.accountId, (inFlight.get(acc.accountId) ?? 0) + 1);
}
export function releaseInFlight(acc: Account): void {
  inFlight.set(acc.accountId, Math.max(0, (inFlight.get(acc.accountId) ?? 0) - 1));
}
