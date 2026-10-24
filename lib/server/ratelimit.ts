import { tooMany } from "./errors";

/**
 * Best-effort sliding-window limiter. State lives in process memory, so on a
 * serverless platform each warm instance counts separately: this blunts
 * scripts and double-taps but is not a hard global quota.
 */
const hits = new Map<string, number[]>();
let lastSweep = 0;

export function rateLimit(key: string, max: number, windowMs: number, nowMs = Date.now()): void {
  if (nowMs - lastSweep > 60_000) {
    lastSweep = nowMs;
    for (const [k, list] of hits) {
      if (list.length === 0 || nowMs - list[list.length - 1] > 10 * 60_000) hits.delete(k);
    }
  }
  const recent = (hits.get(key) ?? []).filter((t) => nowMs - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    throw tooMany();
  }
  recent.push(nowMs);
  hits.set(key, recent);
}

export function resetRateLimits(): void {
  hits.clear();
}
