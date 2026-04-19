/**
 * Zod schemas for paid-event registration + reconciliation.
 *
 * Separate file from events.js because these are OPERATOR-facing
 * mutations (admin marking someone paid/rejected) plus the USER-facing
 * "here's my UPI reference" submission. Events.js is CREATOR-facing
 * (the teacher configuring the event). Keeping them apart means a
 * grep for "mark paid" lands directly in one file.
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────
   STUDENT — "I've paid, here's the UPI reference"
   ──────────────────────────────────────────────────────────── */

// UPI transaction reference numbers are typically 12 digits on GPay /
// PhonePe / Paytm but some banks (especially HDFC business accounts)
// return alphanumeric 12-22 char strings. We allow both.
const upiRef = z.string().trim()
  .min(8,  "UPI reference looks too short — check your bank app")
  .max(32, "UPI reference looks too long — check your bank app")
  .regex(/^[A-Za-z0-9]+$/, "UPI reference must be letters and digits only");

export const submitPaymentSchema = z.object({
  paymentRef: upiRef,
});

/* ────────────────────────────────────────────────────────────
   STUDENT — "Register me (or my team) for this event"
   team_name + team_size only apply to team events; the controller
   re-validates against the event's min/max and drops them on solo
   events. Zod stays permissive here so a stray payload doesn't 400
   when the frontend couldn't know the event is solo.
   ──────────────────────────────────────────────────────────── */
export const registerForEventSchema = z.object({
  team_name: z.string().trim().min(1, "team name required").max(80, "team name too long").optional(),
  team_size: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

/* ────────────────────────────────────────────────────────────
   ADMIN — "I verified this payment in my bank app"
   ──────────────────────────────────────────────────────────── */

// Mark-paid takes no body on purpose: the action is unconditional
// given the admin has verified the payment out-of-band. Sending
// additional fields would suggest the admin can override price /
// timestamp, which we don't want — those come from the registration
// row and the server clock.
export const markPaidSchema = z.object({}).strict();

// Reject WITH a reason the student actually sees. 300 chars keeps
// admins from pasting essays and matches the UI textarea hint.
export const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(1, "reason required so the student knows why").max(300, "keep the reason under 300 chars"),
});
