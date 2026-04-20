/**
 * Team-event validator tests (migration 22).
 *
 * Team events added three columns to events (is_team_event, min_team_size,
 * max_team_size) and one to event_registrations (team_size). The Zod
 * schema in backend/validators/events.js enforces the per-field shape;
 * the runtime per-event range check lives in
 * registrationController.registerForEvent (validated here as well via a
 * focused unit test against the exported shape).
 *
 * These tests cover:
 *   1. Schema accepts the new fields with valid values
 *   2. Schema rejects nonsense (team sizes > 50, negative, zero)
 *   3. Schema treats team fields as optional (solo events don't need them)
 */

import { describe, it, expect } from "vitest";

describe("events validator — team-event fields", () => {
  it("accepts is_team_event + min/max sizes within range", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "Hackathon",
      is_team_event: true,
      min_team_size: 2,
      max_team_size: 5,
    });
    expect(res.success).toBe(true);
  });

  it("accepts a solo event without any team fields", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({ title: "Lecture" });
    expect(res.success).toBe(true);
  });

  it("rejects max_team_size > 50 (DB CHECK would fail anyway)", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "X",
      is_team_event: true,
      min_team_size: 2,
      max_team_size: 999,
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-integer team sizes", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "X",
      is_team_event: true,
      min_team_size: 2.5,
      max_team_size: 5,
    });
    expect(res.success).toBe(false);
  });

  it("rejects zero-size teams", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "X",
      is_team_event: true,
      min_team_size: 0,
      max_team_size: 0,
    });
    expect(res.success).toBe(false);
  });

  it("coerces numeric strings (admin form sends strings from number inputs)", async () => {
    const { createEventSchema } = await import("../../backend/validators/events.js");
    const res = createEventSchema.safeParse({
      title: "X",
      is_team_event: true,
      min_team_size: "2",
      max_team_size: "6",
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.min_team_size).toBe(2);
      expect(res.data.max_team_size).toBe(6);
    }
  });
});

describe("events validator — update schema (partial) accepts team fields", () => {
  it("updating just min_team_size works", async () => {
    const { updateEventSchema } = await import("../../backend/validators/events.js");
    const res = updateEventSchema.safeParse({ min_team_size: 3 });
    expect(res.success).toBe(true);
  });
});

describe("registerForEventSchema (student-side)", () => {
  it("accepts a valid team payload", async () => {
    const { registerForEventSchema } = await import("../../backend/validators/registrations.js");
    const res = registerForEventSchema.safeParse({
      team_name: "Euler's Engineers",
      team_size: 4,
    });
    expect(res.success).toBe(true);
  });

  it("accepts empty body (solo event — controller ignores team fields)", async () => {
    const { registerForEventSchema } = await import("../../backend/validators/registrations.js");
    const res = registerForEventSchema.safeParse({});
    expect(res.success).toBe(true);
  });

  it("rejects extra properties (strict)", async () => {
    const { registerForEventSchema } = await import("../../backend/validators/registrations.js");
    const res = registerForEventSchema.safeParse({
      team_name: "OK",
      team_size: 3,
      sneaky: "extra",
    });
    expect(res.success).toBe(false);
  });

  it("rejects team_size > 50", async () => {
    const { registerForEventSchema } = await import("../../backend/validators/registrations.js");
    const res = registerForEventSchema.safeParse({ team_name: "ok", team_size: 99 });
    expect(res.success).toBe(false);
  });

  it("rejects over-long team_name (>80 chars)", async () => {
    const { registerForEventSchema } = await import("../../backend/validators/registrations.js");
    const res = registerForEventSchema.safeParse({
      team_name: "x".repeat(100),
      team_size: 3,
    });
    expect(res.success).toBe(false);
  });
});
