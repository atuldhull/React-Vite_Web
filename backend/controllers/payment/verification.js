/**
 * Client-side payment verification after the Razorpay checkout modal
 * returns success to the browser.
 *
 * POST /api/payment/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Auth: requireAdmin
 *
 * Flow:
 *  1. HMAC-verify the signature (prevents client tampering).
 *  2. Look up our stored payment_history row.
 *  3. If already paid, return success idempotently (verify + webhook race).
 *  4. Upgrade the org plan and mark the payment as paid.
 *  5. Send invoice email (best-effort).
 */

import crypto from "crypto";
import supabase from "../../config/supabase.js";
import { paymentSigningKey } from "./config.js";
import { applyPlanUpgrade } from "./upgrade.js";
import { sendInvoiceEmail } from "./invoiceEmail.js";

export const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const orgId = req.orgId;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment fields" });
  }

  try {
    // 1. HMAC signature check
    let expectedSig;
    try {
      expectedSig = crypto
        .createHmac("sha256", paymentSigningKey())
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
    } catch (err) {
      return res.status(503).json({ error: err.message });
    }

    // Constant-time compare to prevent timing attacks
    const a = Buffer.from(expectedSig, "hex");
    const b = Buffer.from(String(razorpay_signature), "hex");
    const sigValid = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!sigValid) {
      await supabase
        .from("payment_history")
        .update({ status: "failed" })
        .eq("razorpay_order_id", razorpay_order_id);
      return res.status(400).json({ error: "Payment signature verification failed" });
    }

    // 2. Fetch our record — must belong to this org
    const { data: payment } = await supabase
      .from("payment_history")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!payment) return res.status(404).json({ error: "Payment record not found" });

    // 3. Idempotency — if webhook already upgraded this, return current state
    if (payment.status === "paid") {
      return res.json({
        success:    true,
        plan_name:  payment.plan_name,
        expires_at: payment.plan_expires_at,
        message:    "Payment already processed.",
      });
    }

    // 4. Upgrade the org + mark payment paid (shared with webhook)
    const { expiresAt } = await applyPlanUpgrade({
      orgId,
      orderId:   razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      payment,
    });

    // 5. Invoice email (non-blocking — don't fail verify if mail fails)
    try {
      const { data: org }  = await supabase
        .from("organisations").select("name").eq("id", orgId).maybeSingle();
      const { data: user } = await supabase
        .from("students").select("name, email").eq("user_id", req.userId).maybeSingle();
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("display_name")
        .eq("name", payment.plan_name)
        .maybeSingle();

      if (user?.email) {
        await sendInvoiceEmail({
          to:        user.email,
          userName:  user.name || "Admin",
          orgName:   org?.name || "Your Organisation",
          planName:  plan?.display_name || payment.plan_name,
          amount:    payment.amount,
          orderId:   razorpay_order_id,
          paymentId: razorpay_payment_id,
          expiresAt,
        });
      }
    } catch (err) {
      console.error("[Payment] Invoice email failed:", err.message);
    }

    console.log(
      `[Payment] \u2713 org=${orgId} upgraded to ${payment.plan_name} | ${razorpay_payment_id}`,
    );

    return res.json({
      success:    true,
      plan_name:  payment.plan_name,
      expires_at: expiresAt.toISOString(),
      message:    `Successfully upgraded to ${payment.plan_name}!`,
    });
  } catch (err) {
    console.error("[Payment] verifyPayment error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
