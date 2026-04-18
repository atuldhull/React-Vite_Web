/**
 * Unit tests for backend/validators/events.js.
 *
 * Events are the largest mutation payloads in the app and touch real
 * money (paid events via UPI/QR). Weak validation here means:
 *   - An admin can silently stuff a 5MB QR image into every event
 *     page (DoS against list endpoints)
 *   - A wrong UPI VPA format slips through and students pay to a
 *     wrong handle
 *   - Negative prices or 10-lakh-plus prices bypass the cap
 *
 * Pure schema parsing — no DB, no controller.
 */

import { describe, it, expect } from "vitest";
import { createEventSchema, updateEventSchema } from "../../backend/validators/events.js";

// Minimal valid payload — title is the only required field.
const base = { title: "March Meetup" };

// ═══════════════════════════════════════════════════════════
// createEventSchema — title + optional extras
// ═══════════════════════════════════════════════════════════

describe("createEventSchema — core", () => {
  it("accepts a minimal event with just a title", () => {
    const r = createEventSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data.title).toBe("March Meetup");
  });

  it("requires a title", () => {
    const r = createEventSchema.safeParse({ description: "no title" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty title", () => {
    const r = createEventSchema.safeParse({ title: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects a 201-char title (over the 200 cap)", () => {
    const r = createEventSchema.safeParse({ title: "x".repeat(201) });
    expect(r.success).toBe(false);
  });

  it("accepts a YYYY-MM-DD date", () => {
    const r = createEventSchema.safeParse({ ...base, date: "2026-05-01" });
    expect(r.success).toBe(true);
  });

  it("accepts an ISO-8601 datetime", () => {
    const r = createEventSchema.safeParse({ ...base, date: "2026-05-01T10:00:00Z" });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    const r = createEventSchema.safeParse({ ...base, date: "next Friday" });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Enums + numerics
// ═══════════════════════════════════════════════════════════

describe("createEventSchema — enums + numerics", () => {
  it("accepts all three venue_type enum values", () => {
    for (const v of ["in-person", "online", "hybrid"]) {
      const r = createEventSchema.safeParse({ ...base, venue_type: v });
      expect(r.success).toBe(true);
    }
  });

  it("rejects unknown venue_type", () => {
    const r = createEventSchema.safeParse({ ...base, venue_type: "metaverse" });
    expect(r.success).toBe(false);
  });

  it("accepts a 6-digit hex banner_color", () => {
    const r = createEventSchema.safeParse({ ...base, banner_color: "#7c3aed" });
    expect(r.success).toBe(true);
  });

  it("rejects a non-hex banner_color", () => {
    const r = createEventSchema.safeParse({ ...base, banner_color: "purple" });
    expect(r.success).toBe(false);
  });

  it("coerces a string max_registrations to number", () => {
    const r = createEventSchema.safeParse({ ...base, max_registrations: "50" });
    expect(r.success).toBe(true);
    expect(r.data.max_registrations).toBe(50);
  });

  it("rejects negative max_registrations", () => {
    const r = createEventSchema.safeParse({ ...base, max_registrations: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects a max_registrations above 100_000 (DoS cap)", () => {
    const r = createEventSchema.safeParse({ ...base, max_registrations: 100001 });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// Paid-events — UPI + QR validation
// ═══════════════════════════════════════════════════════════

describe("createEventSchema — paid events", () => {
  it("accepts a valid UPI VPA", () => {
    const r = createEventSchema.safeParse({ ...base, payment_upi_id: "alice@okhdfcbank" });
    expect(r.success).toBe(true);
  });

  it("accepts a UPI VPA with dots + dashes", () => {
    const r = createEventSchema.safeParse({ ...base, payment_upi_id: "a.b-c_d@ybl" });
    expect(r.success).toBe(true);
  });

  it("rejects a UPI VPA without the @", () => {
    const r = createEventSchema.safeParse({ ...base, payment_upi_id: "alice.okhdfcbank" });
    expect(r.success).toBe(false);
  });

  it("rejects a UPI VPA with a symbol the grammar doesn't allow", () => {
    const r = createEventSchema.safeParse({ ...base, payment_upi_id: "alice$rocks@hdfc" });
    expect(r.success).toBe(false);
  });

  it("accepts a small PNG data URL as payment_qr_base64", () => {
    const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1H";
    const r = createEventSchema.safeParse({ ...base, payment_qr_base64: tiny });
    expect(r.success).toBe(true);
  });

  it("rejects a non-image data URL", () => {
    const r = createEventSchema.safeParse({ ...base, payment_qr_base64: "data:text/plain;base64,SGVsbG8=" });
    expect(r.success).toBe(false);
  });

  it("rejects a 300KB QR payload (over the 200k cap)", () => {
    const huge = "data:image/png;base64," + "A".repeat(200_001);
    const r = createEventSchema.safeParse({ ...base, payment_qr_base64: huge });
    expect(r.success).toBe(false);
  });

  it("caps price_paise at ₹10 lakh (10_00_00_00 paise)", () => {
    const r = createEventSchema.safeParse({ ...base, price_paise: 10_00_00_01 });
    expect(r.success).toBe(false);
  });

  it("accepts a zero price (free event migrated to paid-events table)", () => {
    const r = createEventSchema.safeParse({ ...base, price_paise: 0 });
    expect(r.success).toBe(true);
  });

  it("rejects a negative price", () => {
    const r = createEventSchema.safeParse({ ...base, price_paise: -100 });
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// updateEventSchema — all-partial
// ═══════════════════════════════════════════════════════════

describe("updateEventSchema", () => {
  it("accepts an empty patch (caller said no-op)", () => {
    const r = updateEventSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a single-field toggle of registration_open", () => {
    const r = updateEventSchema.safeParse({ registration_open: false });
    expect(r.success).toBe(true);
  });

  it("still enforces hex format on banner_color updates", () => {
    const r = updateEventSchema.safeParse({ banner_color: "red" });
    expect(r.success).toBe(false);
  });
});
