/**
 * Unit tests for backend/validators/payment.js.
 *
 * Payment is the most sensitive mutation surface — a weak validator
 * here lets attackers pass crafted IDs through the Razorpay signature
 * check and potentially unlock subscriptions without paying.
 *
 * Specifically the regex-based signature shape check is a cheap first
 * filter before the HMAC verification; if it lets through garbage, we
 * waste CPU on crypto against non-signatures.
 */

import { describe, it, expect } from "vitest";
import { createOrderSchema, verifyPaymentSchema } from "../../backend/validators/payment.js";

// ═══════════════════════════════════════════════════════════
// createOrderSchema — only plan_name is owned by the client
// ═══════════════════════════════════════════════════════════

describe("createOrderSchema", () => {
  it("accepts a valid plan_name", () => {
    const r = createOrderSchema.safeParse({ plan_name: "professional" });
    expect(r.success).toBe(true);
    expect(r.data.plan_name).toBe("professional");
  });

  it("trims whitespace from plan_name", () => {
    const r = createOrderSchema.safeParse({ plan_name: "  basic  " });
    expect(r.success).toBe(true);
    expect(r.data.plan_name).toBe("basic");
  });

  it("rejects missing plan_name", () => {
    const r = createOrderSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects an empty plan_name", () => {
    const r = createOrderSchema.safeParse({ plan_name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a whitespace-only plan_name (trims to empty)", () => {
    const r = createOrderSchema.safeParse({ plan_name: "    " });
    expect(r.success).toBe(false);
  });

  it("rejects a 65-char plan_name (DoS cap)", () => {
    const r = createOrderSchema.safeParse({ plan_name: "x".repeat(65) });
    expect(r.success).toBe(false);
  });

  // Deliberate: we do NOT inject amount/currency/receipt — those come
  // from the DB server-side to stop a client from paying ₹1 for the
  // Enterprise tier.
  it("does NOT accept amount from the client (server computes it)", () => {
    const r = createOrderSchema.safeParse({ plan_name: "enterprise", amount: 1 });
    expect(r.success).toBe(true);
    // The schema parses successfully but the amount field is dropped.
    expect(r.data.amount).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// verifyPaymentSchema — Razorpay's signed triple
// ═══════════════════════════════════════════════════════════

describe("verifyPaymentSchema", () => {
  const validSig = "a".repeat(64);

  it("accepts a real-shaped Razorpay triple", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "order_ABC123xyz",
      razorpay_payment_id: "pay_ABC123xyz",
      razorpay_signature:  validSig,
    });
    expect(r.success).toBe(true);
  });

  it("accepts uppercase hex signatures", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "order_A",
      razorpay_payment_id: "pay_A",
      razorpay_signature:  "A".repeat(64),
    });
    expect(r.success).toBe(true);
  });

  it("rejects a signature shorter than 64 hex chars", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "order_A",
      razorpay_payment_id: "pay_A",
      razorpay_signature:  "a".repeat(63),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a signature longer than 64 hex chars", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "order_A",
      razorpay_payment_id: "pay_A",
      razorpay_signature:  "a".repeat(65),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a signature containing non-hex chars", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "order_A",
      razorpay_payment_id: "pay_A",
      razorpay_signature:  "g".repeat(64),
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing order_id (would let an attacker rebind any payment)", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_payment_id: "pay_A",
      razorpay_signature:  validSig,
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty payment_id", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "order_A",
      razorpay_payment_id: "",
      razorpay_signature:  validSig,
    });
    expect(r.success).toBe(false);
  });

  it("rejects oversized order_id (>128 chars — DoS cap)", () => {
    const r = verifyPaymentSchema.safeParse({
      razorpay_order_id:   "x".repeat(129),
      razorpay_payment_id: "pay_A",
      razorpay_signature:  validSig,
    });
    expect(r.success).toBe(false);
  });
});
