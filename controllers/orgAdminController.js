/**
 * controllers/orgAdminController.js
 *
 * ORGANISATION ADMIN CONTROLLER
 * Role: admin (org-scoped) — manages their own org only.
 * All queries auto-scoped via req.db (tenantMiddleware).
 */

import supabase from "../config/supabase.js";

/* ═══════════════════════════════════════════════════════
   ORG DASHBOARD STATS
   GET /api/admin/org-stats
═══════════════════════════════════════════════════════ */
export const getOrgStats = async (req, res) => {
  const orgId = req.orgId;
  try {
    const [
      { count: totalUsers },
      { count: totalChallenges },
      { count: totalEvents },
      { count: totalAttempts },
    ] = await Promise.all([
      req.db.from("students").select("*", { count: "exact", head: true }),
      req.db.from("challenges").select("*", { count: "exact", head: true }).eq("is_active", true),
      req.db.from("events").select("*", { count: "exact", head: true }).eq("is_active", true),
      req.db.from("arena_attempts").select("*", { count: "exact", head: true }),
    ]);

    const { data: org } = await supabase
      .from("organisations")
      .select("name, plan_name, status, feature_flags, subscription_plans(*)")
      .eq("id", orgId)
      .single();

    // Top 5 students this week
    const { data: topStudents } = await req.db
      .from("students")
      .select("name, weekly_xp, xp, title")
      .order("weekly_xp", { ascending: false })
      .limit(5);

    return res.json({
      stats: { totalUsers, totalChallenges, totalEvents, totalAttempts },
      org,
      topStudents: topStudents || [],
    });
  } catch (err) {
    console.error("[OrgAdmin Stats]", err.message);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};

/* ═══════════════════════════════════════════════════════
   LIST USERS IN ORG
   GET /api/admin/users
═══════════════════════════════════════════════════════ */
export const listOrgUsers = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;

    let query = req.db
      .from("students")
      .select("user_id, name, email, role, xp, weekly_xp, title, is_active, created_at, last_seen_at, department, subject", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (role) query = query.eq("role", role);

    const { data, error, count } = await query;
    if (error) throw error;

    // Apply search client-side (Supabase free tier doesn't support full-text on all columns)
    let filtered = data || [];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
      );
    }

    return res.json({ data: filtered, total: count, page: Number(page) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   UPDATE USER ROLE (within org)
   PATCH /api/admin/users/:userId/role
═══════════════════════════════════════════════════════ */
export const updateUserRole = async (req, res) => {
  const { userId } = req.params;
  const { role }   = req.body;

  if (!["student", "teacher", "admin"].includes(role)) {
    return res.status(400).json({ error: "Invalid role. Must be student, teacher, or admin." });
  }

  try {
    // Make sure user belongs to this org
    const { data: user } = await req.db
      .from("students")
      .select("user_id, name, org_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: "User not found in your organisation" });

    await supabase
      .from("students")
      .update({ role })
      .eq("user_id", userId)
      .eq("org_id", req.orgId);  // double-lock: ensure org match

    await req.db.audit("update_user_role", "student", userId, { new_role: role, name: user.name });
    return res.json({ success: true, role });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   SUSPEND / ACTIVATE USER
   POST /api/admin/users/:userId/suspend
   POST /api/admin/users/:userId/activate
═══════════════════════════════════════════════════════ */
export const setUserStatus = (isActive) => async (req, res) => {
  const { userId } = req.params;

  try {
    const { data: user } = await req.db
      .from("students").select("name").eq("user_id", userId).maybeSingle();
    if (!user) return res.status(404).json({ error: "User not found in your organisation" });

    await supabase.from("students")
      .update({ is_active: isActive })
      .eq("user_id", userId)
      .eq("org_id", req.orgId);

    await req.db.audit(isActive ? "activate_user" : "suspend_user", "student", userId, { name: user.name });
    return res.json({ success: true, is_active: isActive });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   INVITE USER
   POST /api/admin/invite
═══════════════════════════════════════════════════════ */
export const inviteUser = async (req, res) => {
  const { email, role = "student" } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  if (!["student", "teacher", "admin"].includes(role))
    return res.status(400).json({ error: "Invalid role" });

  try {
    // Check plan limit
    const org = await req.db.getOrg();
    const planMaxUsers = org?.subscription_plans?.max_users || 50;

    if (planMaxUsers > 0) {
      const { count } = await req.db
        .from("students")
        .select("*", { count: "exact", head: true });
      if (count >= planMaxUsers) {
        return res.status(403).json({
          error: `User limit reached (${planMaxUsers}). Upgrade your plan to add more users.`,
          upgrade_required: true,
        });
      }
    }

    const { data: inv, error } = await supabase
      .from("org_invitations")
      .insert({
        org_id:     req.orgId,
        email:      email.toLowerCase(),
        role,
        invited_by: req.userId,
      })
      .select()
      .single();

    if (error) throw error;

    // TODO: Send email with invite link: /register?token=${inv.token}
    // await sendInviteEmail(email, inv.token, org.name);

    await req.db.audit("invite_user", "student", null, { email, role });
    return res.json({
      success: true,
      invite_link: `${process.env.BASE_URL || ''}/register?token=${inv.token}`,
      expires_at: inv.expires_at,
    });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "An invite for this email already exists" });
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   GET ORG BRANDING
   GET /api/admin/branding
═══════════════════════════════════════════════════════ */
export const getBranding = async (req, res) => {
  try {
    const { data } = await supabase
      .from("organisations")
      .select("name, primary_color, secondary_color, logo_url, favicon_url, subdomain, custom_domain")
      .eq("id", req.orgId)
      .single();
    return res.json(data || {});
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   UPDATE ORG BRANDING (admin can update their own org's look)
   PATCH /api/admin/branding
═══════════════════════════════════════════════════════ */
export const updateBranding = async (req, res) => {
  const allowed = ["primary_color", "secondary_color", "logo_url", "favicon_url"];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  if (!Object.keys(updates).length)
    return res.status(400).json({ error: "No valid fields" });

  try {
    // Check custom_branding feature flag
    const org = await req.db.getOrg();
    const canBrand = org?.feature_flags?.custom_branding
      || org?.subscription_plans?.features?.custom_branding;

    if (!canBrand) {
      return res.status(403).json({
        error: "Custom branding requires Pro plan or higher",
        upgrade_required: true,
      });
    }

    await supabase.from("organisations").update(updates).eq("id", req.orgId);
    await req.db.audit("update_branding", "organisation", req.orgId, updates);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   ORG ANALYTICS (scoped to their org only)
   GET /api/admin/analytics
═══════════════════════════════════════════════════════ */
export const getOrgAnalytics = async (req, res) => {
  try {
    // Active users last 7d
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeUsers } = await req.db
      .from("students")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", sevenDaysAgo);

    // Top performers
    const { data: topStudents } = await req.db
      .from("students")
      .select("name, xp, weekly_xp, title")
      .order("xp", { ascending: false })
      .limit(10);

    // Challenge stats
    const { data: challenges } = await req.db
      .from("challenges")
      .select("difficulty, count:id", { count: "exact" });

    return res.json({ activeUsers, topStudents, challenges });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/* ═══════════════════════════════════════════════════════
   FEATURE MANAGEMENT
   Org admins can toggle features within their plan's allowance
═══════════════════════════════════════════════════════ */

/* GET /api/org-admin/features — get org features with plan context */
export const getOrgFeatures = async (req, res) => {
  const orgId = req.orgId;
  try {
    const { data: org } = await supabase
      .from("organisations")
      .select("feature_flags, plan_name, status")
      .eq("id", orgId)
      .single();

    if (!org) return res.status(404).json({ error: "Organisation not found" });

    // Get plan features
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("features, max_users, max_challenges, max_events, display_name")
      .eq("name", org.plan_name)
      .maybeSingle();

    const planFeatures = plan?.features || {};
    const orgOverrides = org.feature_flags || {};

    // Build merged view: for each feature, show plan default + org override + effective state
    const merged = {};
    const allKeys = new Set([...Object.keys(planFeatures), ...Object.keys(orgOverrides)]);
    allKeys.forEach(key => {
      const inPlan = planFeatures[key] ?? false;
      const hasOverride = key in orgOverrides;
      const overrideValue = orgOverrides[key];
      merged[key] = {
        in_plan: inPlan,
        has_override: hasOverride,
        override_value: hasOverride ? overrideValue : null,
        effective: hasOverride ? overrideValue : inPlan,
      };
    });

    return res.json({
      plan_name: org.plan_name,
      plan_display: plan?.display_name || org.plan_name,
      plan_limits: {
        max_users: plan?.max_users || -1,
        max_challenges: plan?.max_challenges || -1,
        max_events: plan?.max_events || -1,
      },
      features: merged,
      org_overrides: orgOverrides,
      plan_features: planFeatures,
      status: org.status,
    });
  } catch (err) {
    console.error("[OrgAdmin Features]", err.message);
    return res.status(500).json({ error: "Failed" });
  }
};

/* PATCH /api/org-admin/features — toggle a feature (within plan allowance) */
export const toggleOrgFeature = async (req, res) => {
  const orgId = req.orgId;
  const { feature, enabled } = req.body;

  if (!feature || typeof enabled !== "boolean") {
    return res.status(400).json({ error: "feature (string) and enabled (boolean) required" });
  }

  try {
    // Get current org data
    const { data: org } = await supabase
      .from("organisations")
      .select("feature_flags, plan_name")
      .eq("id", orgId)
      .single();

    if (!org) return res.status(404).json({ error: "Organisation not found" });

    // Get plan to check if feature is available
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("features")
      .eq("name", org.plan_name)
      .maybeSingle();

    const planFeatures = plan?.features || {};
    const inPlan = planFeatures[feature] ?? false;

    // Org admins can only DISABLE features included in their plan
    // They CANNOT enable features NOT in their plan (that requires super admin override)
    if (enabled && !inPlan) {
      return res.status(403).json({
        error: `Cannot enable '${feature}' — not included in your ${org.plan_name} plan`,
        upgrade_required: true,
      });
    }

    // Update the override
    const flags = { ...(org.feature_flags || {}) };
    if (enabled && inPlan) {
      // Enabling a plan feature = remove override (plan default is true)
      delete flags[feature];
    } else {
      // Disabling = set explicit override to false
      flags[feature] = enabled;
    }

    const { error } = await supabase
      .from("organisations")
      .update({ feature_flags: flags })
      .eq("id", orgId);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ success: true, feature, enabled, flags });
  } catch (err) {
    console.error("[OrgAdmin Toggle Feature]", err.message);
    return res.status(500).json({ error: "Failed" });
  }
};