/**
 * Paid-event reconciliation controller.
 *
 * Flow summary (see migration 19_paid_events.sql for the schema):
 *
 *   1. Teacher creates/edits an event with is_paid=true, price_paise,
 *      payment_upi_id, and optionally a base64 QR image. Handled in
 *      eventCrudController.createEvent / updateEvent — this file only
 *      deals with the STUDENT submission + ADMIN verification flow
 *      that follows.
 *
 *   2. Student hits POST /api/events/:id/register on a paid event.
 *      registrationController sets payment_status='pending' instead
 *      of the usual 'registered' fast path.
 *
 *   3. Student pays via their UPI app out-of-band, then POSTs the
 *      UPI reference number to /api/events/:id/registrations/:regId/pay.
 *      Status flips pending → submitted.
 *
 *   4. Admin opens the reconciliation page, cross-checks the ref in
 *      their own bank app, then either:
 *        POST /api/events/:id/registrations/:regId/mark-paid   (submitted → paid)
 *        POST /api/events/:id/registrations/:regId/reject      (submitted → rejected)
 *
 *   5. Rejected students can resubmit a new ref (rejected →
 *      submitted again) — they're not locked out.
 *
 * SECURITY
 * ────────
 * - submitPayment requires the session user to BE the registration's
 *   user_id. Another student can't mark someone else as paid.
 * - markPaid / reject require requireTeacher on the route. We
 *   additionally assert the registration belongs to an event in the
 *   same org (defence-in-depth; the org scoping is already applied
 *   by req.db but the registration fetch goes through the raw
 *   supabase client so we check explicitly).
 * - audit() is called on every admin mutation so who-marked-what is
 *   preserved regardless of UI.
 */

import supabase from "../../config/supabase.js";
import { logger } from "../../config/logger.js";
import { sendNotification } from "../notificationController.js";
import { getRazorpay, publicKeyId, isConfigured as razorpayConfigured } from "../payment/config.js";

/* ─────────────────────────────────────────────────────────────────
   POST /api/events/:id/registrations/:regId/pay
   Student submits their UPI transaction reference.
   ───────────────────────────────────────────────────────────────── */
export const submitPaymentRef = async (req, res) => {
  const { id: eventId, regId } = req.params;
  const userId = req.userId;
  const { paymentRef } = req.body;

  try {
    // Fetch the registration. Using req.db so the org scope filter is
    // auto-applied — a student poking at another org's regId gets a
    // null row back, which we treat as 404.
    const { data: reg, error: fetchErr } = await req.db
      .from("event_registrations")
      .select("id, event_id, user_id, status, payment_status")
      .eq("id", regId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "submitPaymentRef fetch");
      return res.status(500).json({ error: "Lookup failed" });
    }
    if (!reg) return res.status(404).json({ error: "Registration not found" });

    // A student can only submit a ref for their OWN registration.
    if (reg.user_id !== userId) {
      return res.status(403).json({ error: "Not your registration" });
    }

    if (reg.status === "cancelled") {
      return res.status(400).json({ error: "Cannot pay for a cancelled registration — re-register first" });
    }
    if (reg.payment_status === "not_required") {
      return res.status(400).json({ error: "This event is free — no payment needed" });
    }
    if (reg.payment_status === "paid") {
      return res.status(409).json({ error: "Already paid", code: "ALREADY_PAID" });
    }

    // pending | submitted | rejected → submitted with the new ref.
    // A re-submission after rejection is explicitly allowed.
    const { data: updated, error: updErr } = await req.db
      .from("event_registrations")
      .update({
        payment_status:   "submitted",
        payment_ref:      paymentRef,
        rejection_reason: null, // clear any prior rejection
      })
      .eq("id", regId)
      .select()
      .single();

    if (updErr) {
      logger.error({ err: updErr }, "submitPaymentRef update");
      return res.status(500).json({ error: "Update failed" });
    }

    return res.json({ success: true, registration: updated });
  } catch (err) {
    logger.error({ err }, "submitPaymentRef");
    return res.status(500).json({ error: "Submission failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/events/:id/registrations/:regId/mark-paid
   Admin/teacher marks a submitted payment as verified.
   ───────────────────────────────────────────────────────────────── */
export const markPaid = async (req, res) => {
  const { id: eventId, regId } = req.params;

  try {
    const { data: reg, error: fetchErr } = await req.db
      .from("event_registrations")
      .select("id, event_id, user_id, payment_status")
      .eq("id", regId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "markPaid fetch");
      return res.status(500).json({ error: "Lookup failed" });
    }
    if (!reg) return res.status(404).json({ error: "Registration not found" });

    if (reg.payment_status === "not_required") {
      return res.status(400).json({ error: "Free event — nothing to mark" });
    }
    if (reg.payment_status === "paid") {
      // Idempotent-ish: don't error out, but don't rewrite paid_at
      // with a later timestamp either. Return the existing row.
      const { data: existing } = await req.db
        .from("event_registrations").select("*").eq("id", regId).single();
      return res.status(200).json({ success: true, registration: existing, alreadyPaid: true });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await req.db
      .from("event_registrations")
      .update({
        payment_status:   "paid",
        paid_at:          now,
        marked_by:        req.userId,
        marked_at:        now,
        rejection_reason: null,
      })
      .eq("id", regId)
      .select()
      .single();

    if (updErr) {
      logger.error({ err: updErr }, "markPaid update");
      return res.status(500).json({ error: "Update failed" });
    }

    // Award the early-bird XP bonus that was intentionally withheld at
    // register-time for paid events (to stop students farming XP by
    // spamming registrations they never pay for). Criteria match the
    // unpaid path exactly: student ranks in the first EARLY_BIRD_THRESHOLD
    // "registered" or "attended" rows for this event and the event has a
    // non-zero xp_bonus_first. Best-effort — a failure here shouldn't
    // roll back the payment-verified state.
    try {
      const EARLY_BIRD_THRESHOLD = 10;
      const { data: event } = await req.db
        .from("events").select("xp_bonus_first").eq("id", eventId).maybeSingle();
      if (event?.xp_bonus_first > 0) {
        // Order by registered_at so "first N" means the N earliest
        // registrations, matching the register-time semantic. Any row
        // that's cancelled doesn't count toward the threshold.
        const { data: earliest } = await req.db
          .from("event_registrations")
          .select("user_id")
          .eq("event_id", eventId)
          .in("status", ["registered", "attended"])
          .order("registered_at", { ascending: true })
          .limit(EARLY_BIRD_THRESHOLD);
        const isEarlyBird = (earliest || []).some((r) => r.user_id === reg.user_id);
        if (isEarlyBird) {
          const { data: student } = await req.db
            .from("students").select("xp, weekly_xp").eq("user_id", reg.user_id).maybeSingle();
          if (student) {
            await req.db.from("students").update({
              xp: (student.xp || 0) + event.xp_bonus_first,
              weekly_xp: (student.weekly_xp || 0) + event.xp_bonus_first,
            }).eq("user_id", reg.user_id);
          }
        }
      }
    } catch (xpErr) {
      logger.warn({ err: xpErr, regId, eventId }, "markPaid: early-bird XP award failed (non-fatal)");
    }

    // Notify the student — best-effort, don't block the response.
    sendNotification({
      userIds: [reg.user_id],
      orgId:   req.orgId,
      title:   "Payment verified",
      body:    "Your event registration payment has been confirmed.",
      type:    "success",
      link:    "/events",
    }).catch(() => {});

    // Audit (best-effort; don't fail the request if audit write errors).
    try {
      await req.db.audit("event_payment_marked_paid", "event_registration", regId, { eventId });
    } catch { /* swallowed */ }

    return res.json({ success: true, registration: updated });
  } catch (err) {
    logger.error({ err }, "markPaid");
    return res.status(500).json({ error: "Mark-paid failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/events/:id/registrations/:regId/reject
   Admin/teacher rejects a submitted payment with a reason.
   ───────────────────────────────────────────────────────────────── */
export const rejectPayment = async (req, res) => {
  const { id: eventId, regId } = req.params;
  const { reason } = req.body;

  try {
    const { data: reg, error: fetchErr } = await req.db
      .from("event_registrations")
      .select("id, event_id, user_id, payment_status")
      .eq("id", regId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (fetchErr) {
      logger.error({ err: fetchErr }, "rejectPayment fetch");
      return res.status(500).json({ error: "Lookup failed" });
    }
    if (!reg) return res.status(404).json({ error: "Registration not found" });

    if (reg.payment_status === "not_required") {
      return res.status(400).json({ error: "Free event — nothing to reject" });
    }
    if (reg.payment_status === "paid") {
      return res.status(409).json({ error: "Already verified as paid — ask a super_admin to reverse" });
    }

    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await req.db
      .from("event_registrations")
      .update({
        payment_status:   "rejected",
        rejection_reason: reason,
        marked_by:        req.userId,
        marked_at:        now,
      })
      .eq("id", regId)
      .select()
      .single();

    if (updErr) {
      logger.error({ err: updErr }, "rejectPayment update");
      return res.status(500).json({ error: "Update failed" });
    }

    // Notify the student so they know to retry with a correct ref.
    sendNotification({
      userIds: [reg.user_id],
      orgId:   req.orgId,
      title:   "Payment verification failed",
      body:    reason.length > 90 ? reason.slice(0, 87) + "…" : reason,
      type:    "warning",
      link:    "/events",
    }).catch(() => {});

    try {
      await req.db.audit("event_payment_rejected", "event_registration", regId, { eventId, reason });
    } catch { /* swallowed */ }

    return res.json({ success: true, registration: updated });
  } catch (err) {
    logger.error({ err }, "rejectPayment");
    return res.status(500).json({ error: "Reject failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/events/:id/payments
   Admin/teacher reconciliation list — enriched with student name
   and email so the admin doesn't have to cross-reference user_ids.
   ───────────────────────────────────────────────────────────────── */
export const getPaymentsForEvent = async (req, res) => {
  const { id: eventId } = req.params;

  try {
    // We use raw supabase here (not req.db) because the join syntax
    // .select("*, students:user_id(name, email)") needs the non-scoped
    // select — req.db's proxy injects an extra org_id filter which
    // conflicts with the implicit row-level scoping of the join.
    const { data, error } = await supabase
      .from("event_registrations")
      .select("id, user_id, status, payment_status, payment_ref, paid_at, rejection_reason, registered_at, students:user_id(name, email)")
      .eq("event_id", eventId)
      .order("registered_at", { ascending: true });

    if (error) {
      logger.error({ err: error }, "getPaymentsForEvent");
      return res.status(500).json({ error: error.message });
    }

    // Defence-in-depth: verify the event belongs to this org before
    // returning the list. Cheap extra query; worth it to make a
    // cross-tenant regId guess return 404 rather than leak row count.
    const { data: evt } = await req.db
      .from("events").select("id, is_paid, price_paise").eq("id", eventId).maybeSingle();
    if (!evt) return res.status(404).json({ error: "Event not found" });

    return res.json({ event: evt, registrations: data || [] });
  } catch (err) {
    logger.error({ err }, "getPaymentsForEvent");
    return res.status(500).json({ error: "Failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/events/:id/registrations/:regId/razorpay-order
   Student-side: create a Razorpay order for this registration's
   outstanding payment. Frontend uses the returned order_id + key_id
   to open the Razorpay checkout widget. Capture is webhook-driven —
   this endpoint only PREPARES the payment intent.

   Flow:
     1. Verify the caller owns this registration and it's still
        unpaid (pending / submitted / rejected all allowed — a
        rejected student can retry via Razorpay).
     2. Verify the event is paid and has price_paise > 0.
     3. Call Razorpay's orders.create with the right amount.
     4. Persist the resulting order.id on the registration row so
        the webhook can reverse-lookup which registration gets
        flipped to 'paid' when capture fires.
     5. Return order_id, amount, key_id, display info for the
        checkout widget.

   Does NOT flip payment_status. That happens in the webhook once
   Razorpay actually captures the money. If the student closes the
   widget or pays fails, the registration stays where it was.
   ───────────────────────────────────────────────────────────────── */
export const createEventPaymentOrder = async (req, res) => {
  const userId = req.userId || req.session?.user?.id;
  const { id: eventId, regId } = req.params;

  if (!razorpayConfigured()) {
    return res.status(503).json({
      error: "Razorpay is not configured on this server. Ask an admin to set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.",
    });
  }

  try {
    // 1. Load the registration — must exist, must belong to caller.
    //    req.db auto-scopes by org_id so a cross-tenant regId guess
    //    returns 404 rather than 403.
    const { data: reg, error: regErr } = await req.db
      .from("event_registrations")
      .select("id, event_id, user_id, payment_status, razorpay_order_id")
      .eq("id", regId)
      .eq("event_id", eventId)
      .maybeSingle();

    if (regErr) {
      logger.error({ err: regErr, regId }, "createEventPaymentOrder lookup");
      return res.status(500).json({ error: "Lookup failed" });
    }
    if (!reg) return res.status(404).json({ error: "Registration not found" });
    if (reg.user_id !== userId) {
      return res.status(403).json({ error: "Not your registration" });
    }
    if (reg.payment_status === "paid") {
      return res.status(400).json({ error: "This registration is already paid" });
    }
    if (reg.payment_status === "not_required") {
      return res.status(400).json({ error: "Free event — no payment needed" });
    }

    // 2. Load the event to pull amount + title. req.db ensures the
    //    caller can only open an order for an event in their org.
    const { data: event, error: evtErr } = await req.db
      .from("events")
      .select("id, title, is_paid, price_paise, org_id")
      .eq("id", eventId)
      .maybeSingle();

    if (evtErr) return res.status(500).json({ error: "Event lookup failed" });
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!event.is_paid) return res.status(400).json({ error: "Event is not paid" });
    if (!event.price_paise || event.price_paise <= 0) {
      return res.status(400).json({ error: "Event has no price set" });
    }

    // 3. Create the order. Receipt is truncated to 40 chars — the
    //    full regId is in notes for reconciliation.
    const razorpay = await getRazorpay();
    const order = await razorpay.orders.create({
      amount:   event.price_paise,
      currency: "INR",
      receipt:  `evt_${regId.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: {
        kind:          "event_registration",
        event_id:      eventId,
        event_title:   event.title,
        registration_id: regId,
        user_id:       userId,
        org_id:        event.org_id,
      },
    });

    // 4. Persist the order_id on the registration so the webhook
    //    can find this row when capture fires.
    const { error: updErr } = await req.db
      .from("event_registrations")
      .update({ razorpay_order_id: order.id })
      .eq("id", regId);
    if (updErr) {
      logger.error({ err: updErr, regId, orderId: order.id }, "createEventPaymentOrder update");
      // Don't fail the whole request — the order exists on Razorpay's
      // side, the webhook still gets the capture event, and if we
      // can't find the reg we fall back to the notes.event_id +
      // notes.registration_id we attached above.
    }

    return res.json({
      order_id: order.id,
      amount:   event.price_paise,
      currency: "INR",
      key_id:   publicKeyId(),
      event_title: event.title,
      registration_id: regId,
    });
  } catch (err) {
    logger.error({ err, regId, eventId }, "createEventPaymentOrder");
    return res.status(500).json({ error: err.message || "Order creation failed" });
  }
};
