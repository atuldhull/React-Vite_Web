/**
 * Order creation — starts the checkout flow.
 *
 * POST /api/payment/create-order
 * Body: { plan_name }
 * Auth: requireAdmin (org admin only)
 */

import supabase from "../../config/supabase.js";
import { getRazorpay, publicKeyId, isConfigured } from "./config.js";

// Allow-list of plans that are actually purchasable through checkout.
// Guards against a client passing arbitrary plan_name strings.
async function fetchPlanByName(planName) {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, name, display_name, price_monthly")
    .eq("name", planName)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const createOrder = async (req, res) => {
  const { plan_name } = req.body;
  const orgId = req.orgId;

  if (!isConfigured()) {
    return res.status(503).json({
      error: "Payments are not yet configured on this server. Please contact support.",
    });
  }
  if (!plan_name || typeof plan_name !== "string") {
    return res.status(400).json({ error: "plan_name is required" });
  }

  try {
    const plan = await fetchPlanByName(plan_name);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    if (plan.price_monthly === 0) {
      return res.status(400).json({
        error: "Free plan does not require payment. Contact super-admin.",
      });
    }

    const { data: org } = await supabase
      .from("organisations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return res.status(404).json({ error: "Organisation not found" });

    // Razorpay expects paise (INR * 100)
    const amountPaise = Math.round(plan.price_monthly * 100);

    const razorpay = await getRazorpay();
    const order = await razorpay.orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  `rcpt_${orgId.slice(0, 8)}_${Date.now()}`,
      notes: {
        org_id:   orgId,
        org_name: org.name,
        plan_name,
        plan_id:  plan.id,
        user_id:  req.userId,
      },
    });

    // Record a pending order. Status updates happen in verify/webhook.
    await supabase.from("payment_history").insert({
      org_id:            orgId,
      user_id:           req.userId,
      plan_name,
      plan_id:           plan.id,
      razorpay_order_id: order.id,
      amount:            plan.price_monthly,
      currency:          "INR",
      status:            "created",
    });

    return res.json({
      order_id:     order.id,
      amount:       amountPaise,
      currency:     "INR",
      plan_name,
      plan_display: plan.display_name,
      key_id:       publicKeyId(),
    });
  } catch (err) {
    console.error("[Payment] createOrder error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
