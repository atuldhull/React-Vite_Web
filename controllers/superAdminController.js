/**
 * controllers/superAdminController.js
 *
 * PLATFORM-LEVEL SUPER ADMIN CONTROLLER
 * Only accessible to role === 'super_admin'
 *
 * Features:
 *  - Organisation CRUD + suspend/activate
 *  - Assign plans, set feature flags
 *  - Platform-wide analytics
 *  - Impersonation (enter an org as admin)
 *  - Audit logs
 *  - Force-logout org users
 *  - Usage stats per org
 */

import supabase from "../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   PLATFORM ANALYTICS
   GET /api/super-admin/analytics
═══════════════════════════════════════════════════════ */
export const getPlatformAnalytics = async (req, res) => {
  try {
    const [
      { count: totalOrgs },
      { count: activeOrgs },
      { count: totalUsers },
      { count: totalChallenges },
      { count: totalAttempts },
      { data: planBreakdown },
    ] = await Promise.all([
      supabase.from("organisations").select("*", { count: "exact", head: true }),
      supabase.from("organisations").select("*", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("students").select("*", { count: "exact", head: true }).neq("role", "super_admin"),
      supabase.from("challenges").select("*", { count: "exact", head: true }),
      supabase.from("arena_attempts").select("*", { count: "exact", head: true }),
      supabase.from("organisations").select("plan_name").neq("status", "cancelled"),
    ]);

    // Plan breakdown
    const planCounts = (planBreakdown || []).reduce((acc, org) => {
      acc[org.plan_name] = (acc[org.plan_name] || 0) + 1;
      return acc;
    }, {});

    // Active users in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeUsers } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", sevenDaysAgo);

    // Rough MRR
    const { data: plans } = await supabase
      .from("subscription_plans")
      .select("name, price_monthly");
    const planPrices = Object.fromEntries((plans || []).map(p => [p.name, p.price_monthly]));
    const mrr = Object.entries(planCounts).reduce((sum, [plan, count]) => {
      return sum + (planPrices[plan] || 0) * count;
    }, 0);

    // Per-org usage summary
    const { data: orgsWithStats } = await supabase
      .from("organisations")
      .select(`
        id, name, slug, plan_name, status, created_at,
        students!students_org_id_fkey(count),
        challenges!challenges_org_id_fkey(count)
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    return res.json({
      summary: {
        totalOrgs,
        activeOrgs,
        totalUsers,
        activeUsers: activeUsers || 0,
        totalChallenges,
        totalAttempts,
        mrr: mrr.toFixed(2),
      },
      planBreakdown: planCounts,
      recentOrgs: orgsWithStats || [],
    });
  } catch (err) {
    console.error("[SuperAdmin Analytics]", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

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
    plan_name = "free", admin_email, admin_name,
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
   IMPERSONATION — Enter an org as admin
   POST /api/super-admin/impersonate/:orgId
   DELETE /api/super-admin/impersonate (exit)
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

/* ═══════════════════════════════════════════════════════
   GLOBAL LEADERBOARD (cross-org)
   GET /api/super-admin/leaderboard
═══════════════════════════════════════════════════════ */
export const getGlobalLeaderboard = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("students")
      .select("name, email, xp, weekly_xp, title, org_id, organisations(name, slug)")
      .not("role", "eq", "super_admin")
      .eq("is_active", true)
      .order("xp", { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.json((data || []).map((s, i) => ({
      rank:     i + 1,
      name:     s.name || s.email?.split("@")[0],
      xp:       s.xp,
      weekly_xp: s.weekly_xp,
      title:    s.title,
      org:      s.organisations?.name || "Unknown",
      org_slug: s.organisations?.slug,
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   ORG USAGE STATS
   GET /api/super-admin/organisations/:orgId/stats
═══════════════════════════════════════════════════════ */
export const getOrgStats = async (req, res) => {
  const { orgId } = req.params;

  try {
    const [
      { count: users },
      { count: challenges },
      { count: events },
      { count: attempts },
    ] = await Promise.all([
      supabase.from("students").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("challenges").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("events").select("*", { count: "exact", head: true }).eq("org_id", orgId),
      supabase.from("arena_attempts").select("*", { count: "exact", head: true }).eq("org_id", orgId),
    ]);

    const { data: org } = await supabase
      .from("organisations")
      .select("*, subscription_plans(*)")
      .eq("id", orgId)
      .single();

    const plan = org?.subscription_plans;

    return res.json({
      usage: { users, challenges, events, attempts },
      limits: {
        max_users:      plan?.max_users      || 50,
        max_challenges: plan?.max_challenges || 100,
        max_events:     plan?.max_events     || 5,
      },
      org,
    });
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
