/**
 * controllers/superAdmin/impersonation.js
 *
 * Impersonation: enter an org as admin (start) and exit (stop).
 */

import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   IMPERSONATION — Enter an org as admin
   POST /api/super-admin/impersonate/:orgId
═══════════════════════════════════════════════════════ */
export const startImpersonation = async (req, res) => {
  const { orgId } = req.params;
  const { reason } = req.body;

  try {
    const { data: org } = await supabase
      .from("organisations")
      .select("id, name, status")
      .eq("id", orgId)
      .single();

    if (!org) return res.status(404).json({ error: "Organisation not found" });

    // Record impersonation session
    const { data: session } = await supabase
      .from("impersonation_sessions")
      .insert({
        super_admin_id: req.userId,
        target_org_id:  orgId,
        reason,
      })
      .select()
      .single();

    // Store in Express session
    req.session.impersonating_org_id       = orgId;
    req.session.impersonating_org_name     = org.name;
    req.session.impersonation_session_id   = session.id;

    await req.db.audit("start_impersonation", "organisation", orgId, { reason, org_name: org.name });

    return res.json({
      success: true,
      message: `Now impersonating ${org.name}`,
      org_name: org.name,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   EXIT IMPERSONATION
   DELETE /api/super-admin/impersonate
═══════════════════════════════════════════════════════ */
export const stopImpersonation = async (req, res) => {
  const orgId = req.session.impersonating_org_id;

  if (!orgId) return res.json({ success: true, message: "Not impersonating" });

  try {
    if (req.session.impersonation_session_id) {
      await supabase
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString(), is_active: false })
        .eq("id", req.session.impersonation_session_id);
    }

    await req.db.audit("stop_impersonation", "organisation", orgId, {});

    delete req.session.impersonating_org_id;
    delete req.session.impersonating_org_name;
    delete req.session.impersonation_session_id;

    return res.json({ success: true, message: "Exited impersonation mode" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
