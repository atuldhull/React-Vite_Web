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
      const { data: payment } = await supabase
        .from("payment_history")
        .select("*")
        .eq("razorpay_order_id", payload.order_id)
        .maybeSingle();

      if (!payment) {
        // Unknown order — safest to just ack so Razorpay stops retrying
        return res.json({ received: true, note: "unknown order" });
      }

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
    }

    if (event === "payment.failed" && payload?.order_id) {
      await supabase
        .from("payment_history")
        .update({ status: "failed" })
        .eq("razorpay_order_id", payload.order_id);
      logger.warn({ orderId: payload.order_id }, "Webhook payment failed");
    }

    return res.json({ received: true });
  } catch (err) {
    logger.error({ err: err }, "Webhook Error");
    // Return 500 so Razorpay retries — don't swallow silently.
    return res.status(500).json({ error: err.message });
  }
};
