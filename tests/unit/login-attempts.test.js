/**
 * Tests for backend/lib/loginAttempts.js — the in-memory failed-login
 * lockout tracker.
 *
 * The module owns a process-wide Map, so every test calls _resetForTests
 * before doing its thing. We pass an explicit `now` to every function
 * so tests are deterministic without fake-timers.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  isLocked,
  recordFailure,
  recordSuccess,
  computeNextStateOnFail,
  _resetForTests,
  _snapshotForTests,
  _constants,
} from "../../backend/lib/loginAttempts.js";

const { MAX_FAILED_ATTEMPTS, LOCKOUT_WINDOW_MS, LOCKOUT_DURATION_MS } = _constants;

beforeEach(() => _resetForTests());

describe("loginAttempts.isLocked", () => {
  it("returns not-locked for a fresh email", () => {
    expect(isLocked("nobody@example.com")).toEqual({ locked: false });
  });

  it("handles null/empty/non-string emails without throwing", () => {
    expect(isLocked(null)).toEqual({ locked: false });
    expect(isLocked("")).toEqual({ locked: false });
    expect(isLocked(undefined)).toEqual({ locked: false });
    expect(isLocked(123)).toEqual({ locked: false });
  });
});

describe("loginAttempts.recordFailure", () => {
  it("first failure does not lock", () => {
    const out = recordFailure("alice@x.com", 1_000_000);
    expect(out.locked).toBe(false);
    expect(_snapshotForTests("alice@x.com")).toMatchObject({ count: 1, lockedUntil: 0 });
  });

  it(`locks after exactly MAX_FAILED_ATTEMPTS (${MAX_FAILED_ATTEMPTS}) within the window`, () => {
    const t = 1_000_000;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) {
      expect(recordFailure("alice@x.com", t + i).locked).toBe(false);
    }
    const finalOut = recordFailure("alice@x.com", t + MAX_FAILED_ATTEMPTS);
    expect(finalOut.locked).toBe(true);
    expect(finalOut.retryAfterSec).toBeGreaterThan(0);
    expect(finalOut.retryAfterSec).toBeLessThanOrEqual(LOCKOUT_DURATION_MS / 1000);
  });

  it("isLocked sees the lock immediately after recordFailure trips it", () => {
    const t = 1_000_000;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) recordFailure("alice@x.com", t + i);
    const out = isLocked("alice@x.com", t + MAX_FAILED_ATTEMPTS + 1);
    expect(out.locked).toBe(true);
  });

  it("normalises email case + whitespace before keying", () => {
    const t = 1_000_000;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) recordFailure("  Alice@X.com  ", t + i);
    // Lookup with a totally different casing/spacing variant.
    expect(isLocked("alice@x.com", t + MAX_FAILED_ATTEMPTS + 1).locked).toBe(true);
    expect(isLocked("ALICE@X.COM", t + MAX_FAILED_ATTEMPTS + 1).locked).toBe(true);
  });

  it("attempts older than the window are forgotten (counter resets)", () => {
    const t = 1_000_000;
    // Four attempts close together.
    for (let i = 0; i < 4; i++) recordFailure("alice@x.com", t + i);
    // Fifth attempt LONG after the window — counter resets to 1, no lock.
    const out = recordFailure("alice@x.com", t + LOCKOUT_WINDOW_MS + 5);
    expect(out.locked).toBe(false);
    expect(_snapshotForTests("alice@x.com")).toMatchObject({ count: 1, lockedUntil: 0 });
  });

  it("isLocked auto-clears the entry after the lockout window expires", () => {
    const t = 1_000_000;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) recordFailure("alice@x.com", t + i);
    // Sometime past the lockout duration — should be unlocked AND
    // the snapshot row should be gone (cleaned up lazily).
    const checkAt = t + LOCKOUT_DURATION_MS + 5;
    expect(isLocked("alice@x.com", checkAt).locked).toBe(false);
    expect(_snapshotForTests("alice@x.com")).toBe(null);
  });
});

describe("loginAttempts.recordSuccess", () => {
  it("resets the counter — a near-lock user who finally types it right is not at 4/5", () => {
    const t = 1_000_000;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) recordFailure("alice@x.com", t + i);
    expect(_snapshotForTests("alice@x.com")).toMatchObject({ count: MAX_FAILED_ATTEMPTS - 1 });
    recordSuccess("alice@x.com");
    expect(_snapshotForTests("alice@x.com")).toBe(null);
  });

  it("is a no-op for an email with no recorded state", () => {
    expect(() => recordSuccess("nobody@example.com")).not.toThrow();
    expect(_snapshotForTests("nobody@example.com")).toBe(null);
  });

  it("normalises email like recordFailure does", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) recordFailure("alice@x.com", t + i);
    recordSuccess("  ALICE@X.com  ");
    expect(_snapshotForTests("alice@x.com")).toBe(null);
  });
});

describe("loginAttempts.computeNextStateOnFail (pure)", () => {
  it("first failure starts a new window", () => {
    const next = computeNextStateOnFail(null, 1000);
    expect(next).toEqual({ count: 1, firstFailAt: 1000, lockedUntil: 0 });
  });

  it("stays in-window: count increments, no lock yet", () => {
    const prev = { count: 2, firstFailAt: 1000, lockedUntil: 0 };
    const next = computeNextStateOnFail(prev, 1500);
    expect(next).toEqual({ count: 3, firstFailAt: 1000, lockedUntil: 0 });
  });

  it("MAX_FAILED_ATTEMPTS-th fail flips lockedUntil", () => {
    const prev = { count: MAX_FAILED_ATTEMPTS - 1, firstFailAt: 1000, lockedUntil: 0 };
    const next = computeNextStateOnFail(prev, 1500);
    expect(next.count).toBe(MAX_FAILED_ATTEMPTS);
    expect(next.lockedUntil).toBe(1500 + LOCKOUT_DURATION_MS);
  });

  it("subsequent failures after lock do not extend lockedUntil (no rolling extension)", () => {
    const prev = { count: MAX_FAILED_ATTEMPTS, firstFailAt: 1000, lockedUntil: 2000 };
    const next = computeNextStateOnFail(prev, 1500);
    expect(next.count).toBe(MAX_FAILED_ATTEMPTS + 1);
    expect(next.lockedUntil).toBe(2000); // unchanged
  });

  it("a failure outside the window starts fresh", () => {
    const prev = { count: 3, firstFailAt: 1000, lockedUntil: 0 };
    const tooLate = 1000 + LOCKOUT_WINDOW_MS + 1;
    const next = computeNextStateOnFail(prev, tooLate);
    expect(next).toEqual({ count: 1, firstFailAt: tooLate, lockedUntil: 0 });
  });
});
