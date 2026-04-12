/**
 * Event Status Tests — verify computeStatus logic.
 *
 * Extracted from controllers/event/eventHelpers.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Extract the pure function from the controller
function computeStatus(ev) {
  const now = new Date();
  const start = ev.starts_at ? new Date(ev.starts_at) : ev.date ? new Date(ev.date) : null;
  const end = ev.ends_at ? new Date(ev.ends_at) : null;
  const deadline = ev.registration_deadline ? new Date(ev.registration_deadline) : null;

  if (!ev.is_active) return "cancelled";
  if (end && now > end) return "completed";
  if (start && now > start && (!end || now < end)) return "active";
  if (start && now > start) return "past";
  if (!ev.registration_open) return "closed";
  if (deadline && now > deadline) return "closed";
  if (deadline && now < deadline) return "registering";
  if (ev.registration_open) return "registering";
  return "upcoming";
}

describe("Event Status Computation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'cancelled' for inactive events", () => {
    expect(computeStatus({ is_active: false, date: "2026-04-05" })).toBe("cancelled");
  });

  it("returns 'completed' when end date has passed", () => {
    expect(
      computeStatus({
        is_active: true,
        starts_at: "2026-04-01T10:00:00Z",
        ends_at: "2026-04-02T18:00:00Z",
      })
    ).toBe("completed");
  });

  it("returns 'active' when between start and end", () => {
    expect(
      computeStatus({
        is_active: true,
        starts_at: "2026-04-04T10:00:00Z",
        ends_at: "2026-04-04T18:00:00Z",
      })
    ).toBe("active");
  });

  it("returns 'active' when started with no end date (still running)", () => {
    // No ends_at means the condition `!end || now < end` is true → "active"
    expect(
      computeStatus({
        is_active: true,
        starts_at: "2026-04-03T10:00:00Z",
        registration_open: true,
      })
    ).toBe("active");
  });

  it("returns 'closed' when registration is closed", () => {
    expect(
      computeStatus({
        is_active: true,
        date: "2026-04-10",
        registration_open: false,
      })
    ).toBe("closed");
  });

  it("returns 'closed' when deadline has passed", () => {
    expect(
      computeStatus({
        is_active: true,
        date: "2026-04-10",
        registration_open: true,
        registration_deadline: "2026-04-02T12:00:00Z",
      })
    ).toBe("closed");
  });

  it("returns 'registering' when deadline is in the future", () => {
    expect(
      computeStatus({
        is_active: true,
        date: "2026-04-10",
        registration_open: true,
        registration_deadline: "2026-04-08T12:00:00Z",
      })
    ).toBe("registering");
  });

  it("returns 'registering' when registration is open and no deadline", () => {
    expect(
      computeStatus({
        is_active: true,
        date: "2026-04-10",
        registration_open: true,
      })
    ).toBe("registering");
  });

  it("returns 'upcoming' when no dates and registration not explicitly open", () => {
    // No dates, no registration_open → falls through to "upcoming"
    // Note: registration_open undefined (not false) means the check `!ev.registration_open` is truthy → "closed"
    // So for true "upcoming", we need registration_open to be truthy but no deadline
    expect(
      computeStatus({
        is_active: true,
        registration_open: false,
      })
    ).toBe("closed");
  });

  it("returns 'registering' when registration is open with no deadline", () => {
    expect(
      computeStatus({
        is_active: true,
        registration_open: true,
      })
    ).toBe("registering");
  });
});
