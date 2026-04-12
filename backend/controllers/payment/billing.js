/**
 * Billing history + public plan list.
 */

import supabase from "../../config/supabase.js";

/* GET /api/payment/history — org admin only */
export const getBillingHistory = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("payment_history")
      .select("*")
      .eq("org_id", req.orgId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* GET /api/payment/plans — public */
export const getPublicPlans = async (req, res) => {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("name, display_name, price_monthly, max_users, max_challenges, max_events, features")
    .order("price_monthly");
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
};
