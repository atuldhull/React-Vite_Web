/**
 * controllers/paymentController.js
 *
 * Razorpay Payment Integration for Math Collective
 *
 * Flow:
 *  1. Org admin clicks "Upgrade Plan"
 *  2. POST /api/payment/create-order  → creates Razorpay order, returns order_id
 *  3. Frontend opens Razorpay checkout modal
 *  4. On success, POST /api/payment/verify  → verifies signature, upgrades plan, sends invoice email
 *  5. Razorpay also calls POST /api/payment/webhook for server-side confirmation
 */

import crypto     from "crypto";
import nodemailer from "nodemailer";
import supabase   from "../config/supabase.js";

/* ── Lazily initialise Razorpay (only when keys are present) ── */
let _razorpay = null;
async function getRazorpay() {
  if (_razorpay) return _razorpay;

  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not set in .env.local");
  }

  // Dynamic import so the server boots even before razorpay npm install
  const { default: Razorpay } = await import("razorpay");
  _razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return _razorpay;
}

/* ── Nodemailer transporter (reuses existing CONTACT_EMAIL creds) ── */
function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.CONTACT_EMAIL,
      pass: process.env.CONTACT_APP_PASSWORD,
    },
  });
}

/* ═══════════════════════════════════════════════════════
   CREATE ORDER
   POST /api/payment/create-order
   Body: { plan_name }
   Auth: requireAdmin (org admin only)
═══════════════════════════════════════════════════════ */
export const createOrder = async (req, res) => {
  const { plan_name } = req.body;
  const orgId = req.orgId;

  if (!plan_name) return res.status(400).json({ error: "plan_name is required" });

  try {
    /* 1. Fetch the plan details */
    const { data: plan, error: planErr } = await supabase
      .from("subscription_plans")
      .select("id, name, display_name, price_monthly")
      .eq("name", plan_name)
      .single();

    if (planErr || !plan) return res.status(404).json({ error: "Plan not found" });
    if (plan.price_monthly === 0) {
      return res.status(400).json({ error: "Free plan does not require payment. Contact super-admin." });
    }

    /* 2. Fetch org details */
    const { data: org } = await supabase
      .from("organisations")
      .select("name, plan_name")
      .eq("id", orgId)
      .single();

    if (!org) return res.status(404).json({ error: "Organisation not found" });

    /* 3. Amount in paise (INR × 100) */
    const amountPaise = Math.round(plan.price_monthly * 100);

    /* 4. Create Razorpay order */
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  `rcpt_${orgId.slice(0, 8)}_${Date.now()}`,
      notes: {
        org_id:      orgId,
        org_name:    org.name,
        plan_name,
        plan_id:     plan.id,
        user_id:     req.userId,
      },
    });

    /* 5. Store a pending record in payment_history */
    await supabase.from("payment_history").insert({
      org_id:          orgId,
      user_id:         req.userId,
      plan_name,
      plan_id:         plan.id,
      razorpay_order_id: order.id,
      amount:          plan.price_monthly,
      currency:        "INR",
      status:          "created",
    });

    return res.json({
      order_id:    order.id,
      amount:      amountPaise,
      currency:    "INR",
      plan_name,
      plan_display: plan.display_name,
      key_id:      process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("[Payment] createOrder error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   VERIFY PAYMENT
   POST /api/payment/verify
   Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
   Auth: requireAdmin
═══════════════════════════════════════════════════════ */
export const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const orgId = req.orgId;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment fields" });
  }

  try {
    /* 1. Verify HMAC signature */
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      await supabase.from("payment_history")
        .update({ status: "failed" })
        .eq("razorpay_order_id", razorpay_order_id);

      return res.status(400).json({ error: "Payment signature verification failed" });
    }

    /* 2. Fetch our pending payment record */
    const { data: payment } = await supabase
      .from("payment_history")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .eq("org_id", orgId)
      .single();

    if (!payment) return res.status(404).json({ error: "Payment record not found" });

    /* 3. Upgrade the organisation plan */
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month from now

    await supabase.from("organisations").update({
      plan_name:      payment.plan_name,
      plan_id:        payment.plan_id,
      plan_expires_at: expiresAt.toISOString(),
      status:         "active",
    }).eq("id", orgId);

    /* 4. Mark payment as paid */
    await supabase.from("payment_history").update({
      status:               "paid",
      razorpay_payment_id,
      razorpay_signature,
      paid_at:              new Date().toISOString(),
      plan_expires_at:      expiresAt.toISOString(),
    }).eq("razorpay_order_id", razorpay_order_id);

    /* 5. Fetch org + user details for email */
    const { data: org }  = await supabase.from("organisations").select("name").eq("id", orgId).single();
    const { data: user } = await supabase.from("students").select("name, email").eq("user_id", req.userId).single();
    const { data: plan } = await supabase.from("subscription_plans").select("display_name, price_monthly").eq("name", payment.plan_name).single();

    /* 6. Send invoice email */
    if (user?.email) {
      await sendInvoiceEmail({
        to:         user.email,
        userName:   user.name || "Admin",
        orgName:    org?.name || "Your Organisation",
        planName:   plan?.display_name || payment.plan_name,
        amount:     payment.amount,
        orderId:    razorpay_order_id,
        paymentId:  razorpay_payment_id,
        expiresAt,
      });
    }

    console.log(`[Payment] ✓ ${orgId} upgraded to ${payment.plan_name} | ${razorpay_payment_id}`);

    return res.json({
      success:    true,
      plan_name:  payment.plan_name,
      expires_at: expiresAt.toISOString(),
      message:    `Successfully upgraded to ${plan?.display_name || payment.plan_name}!`,
    });

  } catch (err) {
    console.error("[Payment] verifyPayment error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   WEBHOOK  (called by Razorpay server → server)
   POST /api/payment/webhook
   No auth middleware — signature verified via Razorpay secret
   Add this URL in Razorpay Dashboard → Webhooks
═══════════════════════════════════════════════════════ */
export const razorpayWebhook = async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn("[Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature check");
  } else {
    /* Verify webhook signature */
    const receivedSig = req.headers["x-razorpay-signature"];
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (receivedSig !== expectedSig) {
      console.warn("[Webhook] Invalid signature received");
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  }

  const event   = req.body.event;
  const payload = req.body.payload?.payment?.entity;

  console.log(`[Webhook] Event: ${event}`);

  try {
    if (event === "payment.captured") {
      const orderId = payload?.order_id;
      if (!orderId) return res.json({ received: true });

      /* Fetch our payment record */
      const { data: payment } = await supabase
        .from("payment_history")
        .select("*")
        .eq("razorpay_order_id", orderId)
        .maybeSingle();

      if (!payment || payment.status === "paid") {
        return res.json({ received: true }); // already processed
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      /* Upgrade plan */
      await supabase.from("organisations").update({
        plan_name:       payment.plan_name,
        plan_id:         payment.plan_id,
        plan_expires_at: expiresAt.toISOString(),
        status:          "active",
      }).eq("id", payment.org_id);

      /* Mark paid */
      await supabase.from("payment_history").update({
        status:              "paid",
        razorpay_payment_id: payload.id,
        paid_at:             new Date().toISOString(),
        plan_expires_at:     expiresAt.toISOString(),
      }).eq("razorpay_order_id", orderId);

      console.log(`[Webhook] ✓ Plan upgraded for org ${payment.org_id} → ${payment.plan_name}`);
    }

    if (event === "payment.failed") {
      const orderId = payload?.order_id;
      if (orderId) {
        await supabase.from("payment_history")
          .update({ status: "failed" })
          .eq("razorpay_order_id", orderId);
        console.log(`[Webhook] Payment failed for order ${orderId}`);
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[Webhook] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   GET BILLING HISTORY
   GET /api/payment/history
   Auth: requireAdmin
═══════════════════════════════════════════════════════ */
export const getBillingHistory = async (req, res) => {
  const orgId = req.orgId;
  try {
    const { data, error } = await supabase
      .from("payment_history")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   GET PLAN LIST (public — no auth needed)
   GET /api/payment/plans
═══════════════════════════════════════════════════════ */
export const getPublicPlans = async (req, res) => {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("name, display_name, price_monthly, max_users, max_challenges, max_events, features")
    .order("price_monthly");

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
};

/* ═══════════════════════════════════════════════════════
   INTERNAL: Send invoice email
═══════════════════════════════════════════════════════ */
async function sendInvoiceEmail({ to, userName, orgName, planName, amount, orderId, paymentId, expiresAt }) {
  const transporter = getTransporter();
  const invoiceDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const expiryDate  = expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  try {
    await transporter.sendMail({
      from:    `"Math Collective Billing" <${process.env.CONTACT_EMAIL}>`,
      to,
      subject: `Payment Confirmed — ${planName} Plan | Math Collective`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#f1f5f9;padding:0;border-radius:12px;overflow:hidden;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#7c3aed,#3b82f6);padding:32px;text-align:center;">
            <h1 style="margin:0;font-size:1.4rem;color:#fff;">✦ Math Collective</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:0.85rem;">Payment Invoice</p>
          </div>

          <!-- Body -->
          <div style="padding:32px;">
            <p style="color:#94a3b8;">Hi ${userName},</p>
            <p style="color:#94a3b8;line-height:1.7;">
              Your payment was successful! Your organisation <strong style="color:#f1f5f9;">${orgName}</strong>
              has been upgraded to the <strong style="color:#a78bfa;">${planName}</strong> plan.
            </p>

            <!-- Invoice table -->
            <div style="background:#1e293b;border-radius:10px;padding:20px;margin:24px 0;">
              <h3 style="margin:0 0 16px;color:#a78bfa;font-size:0.9rem;text-transform:uppercase;letter-spacing:0.05em;">Invoice Details</h3>
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Invoice Date</td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;font-size:0.9rem;">${invoiceDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Order ID</td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;font-size:0.8rem;color:#94a3b8;">${orderId}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Payment ID</td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;font-size:0.8rem;color:#94a3b8;">${paymentId}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Plan</td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;">${planName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#64748b;font-size:0.85rem;border-bottom:1px solid #334155;">Valid Until</td>
                  <td style="padding:8px 0;text-align:right;border-bottom:1px solid #334155;color:#4ade80;">${expiryDate}</td>
                </tr>
                <tr>
                  <td style="padding:12px 0;font-weight:700;font-size:1rem;">Total Paid</td>
                  <td style="padding:12px 0;text-align:right;font-weight:700;font-size:1.1rem;color:#4ade80;">₹${amount.toLocaleString("en-IN")}</td>
                </tr>
              </table>
            </div>

            <p style="color:#64748b;font-size:0.8rem;line-height:1.7;">
              Your plan will auto-expire on ${expiryDate}. You will receive a reminder before expiry.
              For any billing queries, reply to this email.
            </p>
          </div>

          <!-- Footer -->
          <div style="padding:20px 32px;border-top:1px solid #1e293b;text-align:center;">
            <p style="color:#334155;font-size:0.75rem;margin:0;">
              Math Collective · BMSIT · ${new Date().getFullYear()}<br>
              This is an automated payment confirmation.
            </p>
          </div>
        </div>
      `,
    });
    console.log(`[Payment] ✓ Invoice sent to ${to}`);
  } catch (err) {
    console.error("[Payment] Invoice email failed:", err.message);
    // Don't throw — payment already verified, email is non-critical
  }
}
