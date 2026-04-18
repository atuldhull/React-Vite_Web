/**
 * Unit tests for backend/controllers/event/eventHelpers.js.
 *
 * These three helpers drive every event listing + detail page:
 *   - generateQrToken powers the QR check-in flow
 *   - computeStatus is what shows "Upcoming / Registering / Active /
 *     Completed / Cancelled / Past / Closed" next to each event card
 *   - validateUUID is the cheap pre-check before any :id DB lookup
 *
 * computeStatus is where user-visible labelling bugs hide (e.g. an
 * event showing "Registering" after its deadline passed, or showing
 * "Upcoming" for a cancelled event). The branching is non-obvious;
 * tests pin it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  generateQrToken,
  computeStatus,
  validateUUID,
} from "../../backend/controllers/event/eventHelpers.js";

// ═══════════════════════════════════════════════════════════
// generateQrToken — random-bytes cryptographic token
// ═══════════════════════════════════════════════════════════

describe("generateQrToken", () => {
  it("returns a 32-char hex string", () => {
    const token = generateQrToken();
    expect(token).toMatch(/^[a-f0-9]{32}$/);
  });

  it("returns unique values across calls", () => {
    const a = generateQrToken();
    const b = generateQrToken();
    expect(a).not.toBe(b);
  });

  it("has high entropy — 100 calls produce 100 unique tokens", () => {
    const set = new Set();
    for (let i = 0; i < 100; i++) set.add(generateQrToken());
    expect(set.size).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════
// validateUUID
// ═══════════════════════════════════════════════════════════

describe("validateUUID", () => {
  it("accepts a canonical UUID v4", () => {
    expect(validateUUID("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("accepts uppercase UUIDs", () => {
    expect(validateUUID("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("rejects malformed UUIDs", () => {
    expect(validateUUID("not-a-uuid")).toBe(false);
    expect(validateUUID("123")).toBe(false);
    expect(validateUUID("")).toBe(false);
  });

  it("rejects UUIDs missing dashes", () => {
    expect(validateUUID("123e4567e89b12d3a456426614174000")).toBe(false);
  });

  it("rejects UUIDs with wrong segment lengths", () => {
    expect(validateUUID("123e4567-e89b-12d3-a456-42661417400")).toBe(false); // last too short
  });

  it("rejects UUIDs with non-hex chars", () => {
    expect(validateUUID("123e4567-e89b-12d3-a456-42661417400z")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// computeStatus — the most branching-heavy helper
// ═══════════════════════════════════════════════════════════

// Stable fixed "now" so status tests don't flake across time zones
// or long CI runs.
const NOW = new Date("2026-06-15T12:00:00Z");
const PAST     = "2026-01-01T00:00:00Z";
const FUTURE   = "2027-01-01T00:00:00Z";

afterEach(() => { vi.useRealTimers(); });

function freezeTime() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe("computeStatus", () => {
  it("returns 'cancelled' whenever is_active is false (highest-priority)", () => {
    freezeTime();
    // Even if everything else says "active", a cancelled event stays
    // cancelled — that's the whole point of the flag.
    expect(computeStatus({
      is_active: false,
      starts_at: PAST, ends_at: FUTURE,
      registration_open: true,
    })).toBe("cancelled");
  });

  it("returns 'completed' when past ends_at", () => {
    freezeTime();
    expect(computeStatus({
      is_active: true,
      starts_at: PAST, ends_at: PAST,
    })).toBe("completed");
  });

  it("returns 'active' between starts_at and ends_at", () => {
    freezeTime();
    expect(computeStatus({
      is_active: true,
      starts_at: PAST, ends_at: FUTURE,
    })).toBe("active");
  });

  it("returns 'active' when started but no ends_at is set (open-ended event)", () => {
    freezeTime();
    // Documented quirk: with starts_at in the past and no ends_at,
    // the "active" branch fires before "past" (since (!end || now<end)
    // is true when end is null). So the "past" branch in the source
    // is dead code in practice.
    expect(computeStatus({ is_active: true, starts_at: PAST })).toBe("active");
  });

  it("returns 'registering' while registration_open is true + deadline not hit", () => {
    freezeTime();
    expect(computeStatus({
      is_active: true,
      registration_open: true,
      registration_deadline: FUTURE,
    })).toBe("registering");
  });

  it("returns 'closed' when registration_deadline has passed", () => {
    freezeTime();
    expect(computeStatus({
      is_active: true,
      registration_open: true,
      registration_deadline: PAST,
    })).toBe("closed");
  });

  it("returns 'closed' when registration_open is false (admin toggled off)", () => {
    freezeTime();
    expect(computeStatus({ is_active: true, registration_open: false })).toBe("closed");
  });

  it("returns 'closed' for a bare event with no dates or registration flags", () => {
    freezeTime();
    // When registration_open is falsy (undefined), computeStatus
    // short-circuits to "closed" — the "upcoming" fallback is only
    // reachable via a very specific combination. This confirms the
    // default behaviour new admins see before toggling anything.
    expect(computeStatus({ is_active: true })).toBe("closed");
  });

  it("returns 'registering' when registration_open=true and no deadline set", () => {
    freezeTime();
    expect(computeStatus({
      is_active: true,
      registration_open: true,
    })).toBe("registering");
  });

  it("prioritises is_active over every other signal", () => {
    freezeTime();
    expect(computeStatus({
      is_active: false,
      registration_open: true,
      registration_deadline: FUTURE,
    })).toBe("cancelled");
  });
});
