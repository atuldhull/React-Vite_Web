/**
 * controllers/superAdmin/auditLogs.js
 *
 * Platform-wide audit log retrieval.
 */

import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   AUDIT LOGS
   GET /api/super-admin/audit-logs
═══════════════════════════════════════════════════════ */
export const getAuditLogs = async (req, res) => {
  try {
    const { org_id, action, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("audit_logs")
      .select("*, organisations(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (org_id)  query = query.eq("org_id", org_id);
    if (action)  query = query.ilike("action", `%${action}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({ data: data || [], total: count, page: Number(page) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
