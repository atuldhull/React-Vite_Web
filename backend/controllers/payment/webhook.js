/**
 * Razorpay server-to-server webhook.
 *
 * POST /api/payment/webhook
 * No session auth — Razorpay calls this. Security comes from the
 * X-Razorpay-Signature HMAC header verified against RAZORPAY_WEBHOOK_SECRET.
 *
 * IMPORTANT: signature verification uses the RAW request body. The route
 * mounted in routes/paymentRoutes.js must preserve req.rawBody (we hook
 * this up in server.js via express.json({ verify }) ).
 */

import crypto from "crypto";
import supabase from "../../config/supabase.js";
import { webhookSecret } from "./config.js";
import { applyPlanUpgrade } from "./upgrade.js";
import { sendNotification } from "../notificationController.js";
import { logger } from "../../config/logger.js";

const isProd = process.env.NODE_ENV === "production";

export const razorpayWebhook = async (req, res) => {
  const secret = webhookSecret();

  // Signature verification — non-negotiable in production.
  if (!secret) {
    if (isProd) {
      logger.error("Webhook RAZORPAY_WEBHOOK_SECRET missing in production — rejecting");
      return res.status(503).json({ error: "Webhook not configured" });
    }
    logger.warn("Webhook RAZORPAY_WEBHOOK_SECRET not set — dev mode, skipping signature check");
  } else {
    // Use the raw request body as Razorpay signed it. Re-serializing
    // JSON is NOT safe (different key order/whitespace breaks the HMAC).
    const rawBody = req.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      logger.error("Webhook raw body missing — server.js not wired correctly");
      return res.status(500).json({ error: "Server misconfigured" });
    }

    const received = req.headers["x-razorpay-signature"];
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    // Constant-time compare
    let ok;
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(String(received || ""), "hex");
      ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      ok = false;
    }

    if (!ok) {
      logger.warn("Webhook Invalid signature");
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  }

  const event   = req.body?.event;
  const payload = req.body?.payload?.payment?.entity;
  logger.info({ event }, "Webhook received");

  try {
    if (event === "payment.captured" && payload?.order_id) {
      // Two flows can originate a capture: subscription plan upgrades
      // (row in payment_history) and event registrations (row in
      // event_registrations). Check both — whichever matches wins.
      // Subscriptions checked first because it's the older flow and
      // most production volume today; order by date eventually.
      const { data: payment } = await supabase
        .from("payment_history")
        .select("*")
        .eq("razorpay_order_id", payload.order_id)
        .maybeSingle();

      if (payment) {
        const result = await applyPlanUpgrade({
          orgId:     payment.org_id,
          orderId:   payload.order_id,
          paymentId: payload.id,
          payment,
        });
        if (!result.alreadyPaid) {
          logger.info(
            { orgId: payment.org_id, plan: payment.plan_name },
            "Webhook org plan upgraded"
          );
        }
      } else {
        // Try the event-registration lookup.
        await handleEventRegistrationCapture(payload);
      }
    }

    if (event === "payment.failed" && payload?.order_id) {
      // Subscription history row
      await supabase
        .from("payment_history")
        .update({ status: "failed" })
        .eq("razorpay_order_id", payload.order_id);
      // Event-registration row — put it back to 'rejected' with the
      // Razorpay failure reason so the student can see why it failed
      // on the events page instead of silent limbo. We don't nuke the
      // razorpay_order_id; the student retrying generates a fresh
      // order and overwrites it.
      await supabase
        .from("event_registrations")
        .update({
          payment_status:   "rejected",
          rejection_reason: payload?.error_description || payload?.error_reason || "Payment failed at Razorpay",
        })
        .eq("razorpay_order_id", payload.order_id);
      logger.warn({ orderId: payload.order_id, reason: payload?.error_reason }, "Webhook payment failed");
    }

    return res.json({ received: true });
  } catch (err) {
    logger.error({ err: err }, "Webhook Error");
    // Return 500 so Razorpay retries — don't swallow silently.
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Look up an event registration by its stored razorpay_order_id and
 * mark it paid. Idempotent — if already paid we no-op. A stray
 * capture for an order we don't recognise is logged and acknowledged
 * so Razorpay stops retrying.
 */
async function handleEventRegistrationCapture(payload) {
  const orderId = payload.order_id;
  const { data: reg, error } = await supabase
    .from("event_registrations")
    .select("id, event_id, user_id, payment_status, org_id")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (error) {
    logger.error({ err: error, orderId }, "handleEventRegistrationCapture lookup");
    return;
  }
  if (!reg) {
    // Unknown order in both the subscription table AND the event
    // registration table. Could be a stale test-mode order or a
    // capture for a resource we don't own. Ack silently.
    logger.info({ orderId }, "Webhook: order not found in either table, acking");
    return;
  }
  if (reg.payment_status === "paid") {
    // Idempotent — Razorpay retries deliver duplicate captures.
    return;
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("event_registrations")
    .update({
      payment_status:  "paid",
      paid_at:         now,
      marked_at:       now,
      // Razorpay capture is our source of truth — no human reviewer
      // is involved, so marked_by stays NULL. Distinguishes auto-
      // verified rows from manually-reconciled UPI ones.
      marked_by:       null,
      rejection_reason: null,
    })
    .eq("id", reg.id);

  if (updErr) {
    logger.error({ err: updErr, regId: reg.id }, "handleEventRegistrationCapture update");
    return;
  }

  logger.info({ regId: reg.id, orderId, paymentId: payload.id }, "Event registration auto-paid via Razorpay");

  // Best-effort student notification so they see the ✓ in the UI
  // without having to hard-refresh. Non-blocking.
  sendNotification({
    userIds: [reg.user_id],
    orgId:   reg.org_id,
    title:   "Payment verified",
    body:    "Your event registration payment has been confirmed automatically.",
    type:    "success",
    link:    "/events",
  }).catch((err) => logger.warn({ err, regId: reg.id }, "auto-paid notification failed"));
}
