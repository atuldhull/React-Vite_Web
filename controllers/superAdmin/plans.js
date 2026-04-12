/**
 * controllers/superAdmin/plans.js
 *
 * Plan assignment, feature flags, plan listing, and platform payment history.
 */

import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   ASSIGN PLAN
   POST /api/super-admin/organisations/:orgId/plan
═══════════════════════════════════════════════════════ */
export const assignPlan = async (req, res) => {
  const { orgId } = req.params;
  const { plan_name, expires_at } = req.body;

  if (!plan_name) return res.status(400).json({ error: "plan_name required" });

  try {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id")
      .eq("name", plan_name)
      .single();

    if (!plan) return res.status(404).json({ error: "Plan not found" });

    await supabase.from("organisations").update({
      plan_name,
      plan_id: plan.id,
      plan_expires_at: expires_at || null,
    }).eq("id", orgId);

    await req.db.audit("assign_plan", "organisation", orgId, { plan_name, expires_at });
    return res.json({ success: true, plan_name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   SET FEATURE FLAGS (per-org override)
   PUT /api/super-admin/organisations/:orgId/features
═══════════════════════════════════════════════════════ */
export const setFeatureFlags = async (req, res) => {
  const { orgId } = req.params;
  const { flags } = req.body; // { ai_tools: true, certificates: false, ... }

  if (!flags || typeof flags !== "object")
    return res.status(400).json({ error: "flags object required" });

  try {
    // Merge with existing flags
    const { data: org } = await supabase
      .from("organisations")
      .select("feature_flags")
      .eq("id", orgId)
      .single();

    const merged = { ...(org?.feature_flags || {}), ...flags };

    await supabase.from("organisations")
      .update({ feature_flags: merged })
      .eq("id", orgId);

    await req.db.audit("set_feature_flags", "organisation", orgId, { flags });
    return res.json({ success: true, feature_flags: merged });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   LIST ALL PLANS
   GET /api/super-admin/plans
═══════════════════════════════════════════════════════ */
export const listPlans = async (req, res) => {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("*")
    .order("price_monthly");
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
};

/* ═══════════════════════════════════════════════════════
   PLATFORM-WIDE PAYMENT HISTORY
   GET /api/super-admin/payments
═══════════════════════════════════════════════════════ */
export const listPlatformPayments = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("payment_history")
      .select("*, organisations(name)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return res.status(500).json({ error: error.message });

    // Flatten org name into each record
    const rows = (data || []).map(r => ({
      ...r,
      org_name: r.organisations?.name || null,
      organisations: undefined,
    }));

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
