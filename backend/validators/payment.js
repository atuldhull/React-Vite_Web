/**
 * Zod schemas for /api/payment/* endpoints.
 *
 * Order creation only requires a plan_name; the rest (amount,
 * currency, receipt) is derived server-side from the DB. That's
 * intentional — letting a client pass an amount would be a gift to
 * any attacker bothering to look at the network tab.
 *
 * Verification takes Razorpay's signed triple. Signatures must match
 * ^[a-f0-9]{64}$ (SHA-256 hex), so we do a cheap sanity check here
 * before the HMAC verification step in the controller — a request
 * that can't produce a valid-looking hash isn't worth a crypto
 * roundtrip.
 */

import { z } from "zod";

export const createOrderSchema = z.object({
  plan_name: z.string().trim().min(1, "plan_name required").max(64),
});

export const verifyPaymentSchema = z.object({
  razorpay_order_id:   z.string().trim().min(1).max(128),
  razorpay_payment_id: z.string().trim().min(1).max(128),
  razorpay_signature:  z.string().trim().regex(/^[a-f0-9]{64}$/i,
    "signature must be a 64-char hex SHA-256 digest"),
});
