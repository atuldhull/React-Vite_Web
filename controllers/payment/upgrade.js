/**
 * Shared "apply plan upgrade" logic used by both the verify endpoint and
 * the webhook. Centralizing this guarantees both paths set the same fields
 * and observe the same "already paid = skip" rule.
 */

import supabase from "../../config/supabase.js";

const ONE_MONTH = (from = new Date()) => {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
};

/**
 * Upgrades the organisation to the plan recorded in payment_history,
 * and marks the payment as paid. Idempotent: returns early if the
 * payment row is already marked paid.
 *
 * @returns {{ expiresAt: Date, alreadyPaid: boolean }}
 */
export async function applyPlanUpgrade({ orgId, orderId, paymentId, signature = null, payment }) {
  // Re-read to detect a race where the other path (verify vs webhook)
  // finished first. payment.status may be stale.
  const { data: fresh } = await supabase
    .from("payment_history")
    .select("status, plan_expires_at")
    .eq("razorpay_order_id", orderId)
    .maybeSingle();

  if (fresh?.status === "paid") {
    return {
      expiresAt: fresh.plan_expires_at ? new Date(fresh.plan_expires_at) : ONE_MONTH(),
      alreadyPaid: true,
    };
  }

  const expiresAt = ONE_MONTH();

  await supabase
    .from("organisations")
    .update({
      plan_name:       payment.plan_name,
      plan_id:         payment.plan_id,
      plan_expires_at: expiresAt.toISOString(),
      status:          "active",
    })
    .eq("id", orgId);

  const paidPatch = {
    status:              "paid",
    razorpay_payment_id: paymentId,
    paid_at:             new Date().toISOString(),
    plan_expires_at:     expiresAt.toISOString(),
  };
  if (signature) paidPatch.razorpay_signature = signature;

  await supabase
    .from("payment_history")
    .update(paidPatch)
    .eq("razorpay_order_id", orderId);

  return { expiresAt, alreadyPaid: false };
}
