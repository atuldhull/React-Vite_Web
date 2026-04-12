/**
 * controllers/superAdmin/organisations.js
 *
 * Organisation CRUD: list, create, update, suspend/activate, force-suspend users, delete.
 */

import supabase from "../../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   LIST ALL ORGANISATIONS
   GET /api/super-admin/organisations
═══════════════════════════════════════════════════════ */
export const listOrganisations = async (req, res) => {
  try {
    const { search, status, plan, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("organisations")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search)  query = query.ilike("name", `%${search}%`);
    if (status)  query = query.eq("status", status);
    if (plan)    query = query.eq("plan_name", plan);

    const { data, error, count } = await query;
    if (error) throw error;

    // Attach user counts
    const orgIds = (data || []).map(o => o.id);
    const { data: userCounts } = await supabase
      .from("students")
      .select("org_id")
      .in("org_id", orgIds)
      .neq("role", "super_admin");

    const countMap = (userCounts || []).reduce((acc, row) => {
      acc[row.org_id] = (acc[row.org_id] || 0) + 1;
      return acc;
    }, {});

    const enriched = (data || []).map(org => ({
      ...org,
      user_count: countMap[org.id] || 0,
    }));

    return res.json({ data: enriched, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[SuperAdmin ListOrgs]", err.message);
    return res.status(500).json({ error: "Failed to list organisations" });
  }
};

/* ═══════════════════════════════════════════════════════
   CREATE ORGANISATION
   POST /api/super-admin/organisations
═══════════════════════════════════════════════════════ */
export const createOrganisation = async (req, res) => {
  const {
    name, slug, institution, contact_email, website,
    plan_name = "free", admin_email,
    primary_color, description,
  } = req.body;

  if (!name || !slug) return res.status(400).json({ error: "name and slug required" });

  try {
    // Create org
    const { data: org, error: orgErr } = await supabase
      .from("organisations")
      .insert({
        name, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        institution, contact_email, website,
        plan_name, primary_color: primary_color || "#7c3aed",
        description,
        created_by: req.userId,
        status: "active",
      })
      .select()
      .single();

    if (orgErr) throw orgErr;

    // If admin_email provided, create an invitation
    if (admin_email) {
      await supabase.from("org_invitations").insert({
        org_id:     org.id,
        email:      admin_email.toLowerCase(),
        role:       "admin",
        invited_by: req.userId,
      });
    }

    await req.db.audit("create_org", "organisation", org.id, { name, plan_name, admin_email });

    return res.status(201).json({ success: true, organisation: org });
  } catch (err) {
    console.error("[SuperAdmin CreateOrg]", err.message);
    if (err.code === "23505") return res.status(400).json({ error: "Slug already taken" });
    return res.status(500).json({ error: "Failed to create organisation" });
  }
};

/* ═══════════════════════════════════════════════════════
   UPDATE ORGANISATION
   PATCH /api/super-admin/organisations/:orgId
═══════════════════════════════════════════════════════ */
export const updateOrganisation = async (req, res) => {
  const { orgId } = req.params;
  const allowed = [
    "name", "institution", "contact_email", "website",
    "primary_color", "secondary_color", "logo_url", "favicon_url",
    "description", "timezone", "locale", "status",
    "custom_domain", "subdomain",
  ];

  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: "No valid fields to update" });

  try {
    const { data, error } = await supabase
      .from("organisations")
      .update(updates)
      .eq("id", orgId)
      .select()
      .single();

    if (error) throw error;

    await req.db.audit("update_org", "organisation", orgId, updates);
    return res.json({ success: true, organisation: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   SUSPEND / ACTIVATE ORG
   POST /api/super-admin/organisations/:orgId/suspend
   POST /api/super-admin/organisations/:orgId/activate
═══════════════════════════════════════════════════════ */
export const setOrgStatus = (newStatus) => async (req, res) => {
  const { orgId } = req.params;
  const { reason } = req.body;

  try {
    await supabase
      .from("organisations")
      .update({ status: newStatus })
      .eq("id", orgId);

    await req.db.audit(`${newStatus}_org`, "organisation", orgId, { reason });
    return res.json({ success: true, status: newStatus });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   FORCE SUSPEND ALL USERS OF AN ORG
   POST /api/super-admin/organisations/:orgId/force-suspend-users
═══════════════════════════════════════════════════════ */
export const forceSuspendOrgUsers = async (req, res) => {
  const { orgId } = req.params;
  const { reason } = req.body;

  try {
    const { count } = await supabase
      .from("students")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .neq("role", "super_admin")
      .select("*", { count: "exact", head: true });

    await req.db.audit("force_suspend_users", "organisation", orgId, { reason, affected: count });
    return res.json({ success: true, affected: count });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   DELETE ORGANISATION (hard delete)
   DELETE /api/super-admin/organisations/:orgId
═══════════════════════════════════════════════════════ */
export const deleteOrganisation = async (req, res) => {
  const { orgId } = req.params;
  const { confirm } = req.body;

  if (confirm !== "DELETE") {
    return res.status(400).json({ error: 'Send { confirm: "DELETE" } to confirm' });
  }

  try {
    const { data: org } = await supabase
      .from("organisations").select("name").eq("id", orgId).single();

    // Cascade deletes handle children via FK constraints
    await supabase.from("organisations").delete().eq("id", orgId);

    await req.db.audit("delete_org", "organisation", orgId, { org_name: org?.name });
    return res.json({ success: true, message: `Organisation ${org?.name} deleted` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
