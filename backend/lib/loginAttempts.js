/**
 * In-memory failed-login tracker → temporary per-email lockout.
 *
 * Why in-memory and not Postgres:
 *   - Lockouts are short-lived (15 min). A server restart unlocking
 *     everyone is BETTER UX after a deploy than a stale row keeping
 *     a legitimate user out.
 *   - Avoids a new table/migration during the hardening pass —
 *     prompt-5 brief is "no schema change".
 *   - The rate-limiter already caps a single IP at 5 attempts/15 min
 *     against one email (loginLimiter), so a distributed brute-force
 *     would need to coordinate hundreds of IPs to outrun this tracker
 *     anyway. The lockout is the SECOND wall after the IP cap.
 *
 * Caveat: on a multi-instance deploy this is per-process, so a 25-attempt
 * burst spread across 5 backends would each see 5 attempts and none
 * would trip. Acceptable for now — Math Collective runs a single Render
 * web instance. If we ever scale horizontally, replace the Map with a
 * Redis SET / INCR pattern.
 *
 * Email key normalisation matches validators/auth.js: trim + lowercase.
 * If "Alice@x.com" failed five times, "alice@x.com" is also locked.
 */

import { logger } from "../config/logger.js";

const MAX_FAILED_ATTEMPTS    = 5;
const LOCKOUT_WINDOW_MS      = 15 * 60 * 1000;   // 15 minutes
const LOCKOUT_DURATION_MS    = 15 * 60 * 1000;   // 15 minutes
// Sweep stale rows hourly so the Map doesn't grow unbounded under
// sustained credential-stuffing. Idempotent — only removes entries
// whose lockout/window has already expired.
const SWEEP_INTERVAL_MS      = 60 * 60 * 1000;

// Map<normalisedEmail, { count: number, firstFailAt: number, lockedUntil: number }>
const attempts = new Map();

function normalise(email) {
  if (!email || typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

/**
 * Pure (test-friendly) helper: given the current state for an email
 * and `now`, return what the new state should be after a failed
 * attempt. Exported so the controller and tests can share the logic.
 */
export function computeNextStateOnFail(prev, now = Date.now()) {
  // Window expired → start fresh
  if (!prev || now - prev.firstFailAt > LOCKOUT_WINDOW_MS) {
    return { count: 1, firstFailAt: now, lockedUntil: 0 };
  }
  const next = { ...prev, count: prev.count + 1 };
  if (next.count >= MAX_FAILED_ATTEMPTS && !next.lockedUntil) {
    next.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
  return next;
}

/**
 * Returns { locked: boolean, retryAfterSec?: number } for the given
 * email. Call BEFORE attempting to authenticate so a locked account
 * can be rejected without burning a Supabase round-trip.
 */
export function isLocked(email, now = Date.now()) {
  const key = normalise(email);
  if (!key) return { locked: false };
  const row = attempts.get(key);
  if (!row || !row.lockedUntil) return { locked: false };
  if (now >= row.lockedUntil) {
    // Lockout expired — drop the row so the next attempt starts fresh.
    attempts.delete(key);
    return { locked: false };
  }
  return {
    locked:        true,
    retryAfterSec: Math.ceil((row.lockedUntil - now) / 1000),
  };
}

/**
 * Record a failed login. Returns the same shape as isLocked() reflecting
 * the state AFTER this failure — so the caller can branch on "you're
 * now locked" without a second call.
 */
export function recordFailure(email, now = Date.now()) {
  const key = normalise(email);
  if (!key) return { locked: false };
  const prev = attempts.get(key);
  const next = computeNextStateOnFail(prev, now);
  attempts.set(key, next);
  if (next.lockedUntil && (!prev || !prev.lockedUntil)) {
    logger.warn({ email: key, attempts: next.count }, "Account locked after failed login attempts");
  }
  if (!next.lockedUntil) return { locked: false };
  return {
    locked:        true,
    retryAfterSec: Math.ceil((next.lockedUntil - now) / 1000),
  };
}

/**
 * Clear the counter for an email — called on SUCCESSFUL login so a
 * student's earlier typos don't accumulate toward a future lockout.
 */
export function recordSuccess(email) {
  const key = normalise(email);
  if (key) attempts.delete(key);
}

/** Test helper — reset all state between test cases. Not exported via index. */
export function _resetForTests() {
  attempts.clear();
}

/** Test helper — peek at internal state without exposing the Map. */
export function _snapshotForTests(email) {
  const key = normalise(email);
  return key ? attempts.get(key) || null : null;
}

export const _constants = {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_WINDOW_MS,
  LOCKOUT_DURATION_MS,
};

// Periodic sweep — keeps the Map bounded under sustained attack. Skipped
// in test runs (vi.useFakeTimers can leave the timer dangling and break
// teardown). Unref'd so the interval can't block process exit.
if (process.env.NODE_ENV !== "test") {
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of attempts.entries()) {
      const stale =
        (v.lockedUntil && now >= v.lockedUntil) ||
        (!v.lockedUntil && now - v.firstFailAt > LOCKOUT_WINDOW_MS);
      if (stale) attempts.delete(k);
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref?.();
}
