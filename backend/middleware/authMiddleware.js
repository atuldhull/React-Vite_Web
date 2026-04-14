/**
 * middleware/authMiddleware.js
 *
 * Multi-tenant aware auth middleware.
 * Roles: super_admin > admin > teacher > student
 *
 * CRITICAL:  Every protected route injects req.orgId automatically.
 *            All DB queries must filter by req.orgId (done in tenantMiddleware).
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

/* ─────────────────────────────────────
   HELPERS
───────────────────────────────────── */

/** Refresh user record from DB and patch session */
async function refreshSession(req) {
  const { data } = await supabase
    .from("students")
    .select("role, xp, title, org_id, is_active")
    .eq("user_id", req.session.user.id)
    .maybeSingle();

  if (data) {
    req.session.user.role    = data.role    || "student";
    req.session.user.org_id  = data.org_id  || null;
    req.session.user.xp      = data.xp      || 0;
    req.session.user.title   = data.title   || "Axiom Scout";
    req.session.user.is_active = data.is_active;
  }
  return data;
}

/* ─────────────────────────────────────
   requireAuth — any logged-in user
───────────────────────────────────── */
export const requireAuth = async (req, res, next) => {
  if (!req.session?.user) {
    return res.status(401).json({ error: "Login required" });
  }

  // Block suspended users
  if (req.session.user.is_active === false) {
    req.session.destroy(() => {});
    return res.status(403).json({ error: "Account suspended" });
  }

  // Inject orgId for downstream use
  req.orgId = req.session.user.org_id || null;
  req.userId = req.session.user.id;
  req.userRole = req.session.user.role;

  // Update last_seen_at (async, don't await — non-blocking)
  supabase
    .from("students")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", req.userId)
    .then(() => {})
    .catch(() => {});

  next();
};

/* ─────────────────────────────────────
   requireSuperAdmin — platform owner only
───────────────────────────────────── */
export const requireSuperAdmin = async (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Login required" });

  if (req.session.user.role === "super_admin") {
    req.userId = req.session.user.id;
    req.userRole = "super_admin";
    req.orgId = null; // super_admin has no org
    return next();
  }

  try {
    const data = await refreshSession(req);
    if (data?.role === "super_admin") {
      req.userId   = req.session.user.id;
      req.userRole = "super_admin";
      req.orgId    = null;
      return next();
    }
    return res.status(403).json({ error: "Super admin access required" });
  } catch {
    return res.status(500).json({ error: "Auth check failed" });
  }
};

/* ─────────────────────────────────────
   requireAdmin — org admin OR super_admin
───────────────────────────────────── */
export const requireAdmin = async (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Login required" });

  const role = req.session.user.role;
  if (role === "admin" || role === "super_admin") {
    req.userId   = req.session.user.id;
    req.userRole = role;
    req.orgId    = role === "super_admin" ? null : req.session.user.org_id;
    return next();
  }

  try {
    const data = await refreshSession(req);
    if (data?.role === "admin" || data?.role === "super_admin") {
      req.userId   = req.session.user.id;
      req.userRole = data.role;
      req.orgId    = data.role === "super_admin" ? null : data.org_id;
      return next();
    }
    return res.status(403).json({ error: "Admin access required" });
  } catch {
    return res.status(500).json({ error: "Auth check failed" });
  }
};

/* ─────────────────────────────────────
   requireTeacher — teacher, admin, or super_admin
───────────────────────────────────── */
export const requireTeacher = async (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Login required" });

  const role = req.session.user.role;
  if (["admin", "teacher", "super_admin"].includes(role)) {
    req.userId   = req.session.user.id;
    req.userRole = role;
    req.orgId    = role === "super_admin" ? null : req.session.user.org_id;
    return next();
  }

  try {
    const data = await refreshSession(req);
    if (["admin", "teacher", "super_admin"].includes(data?.role)) {
      req.userId   = req.session.user.id;
      req.userRole = data.role;
      req.orgId    = data.role === "super_admin" ? null : data.org_id;
      return next();
    }
    return res.status(403).json({ error: "Teacher access required" });
  } catch {
    return res.status(500).json({ error: "Auth check failed" });
  }
};

/* ─────────────────────────────────────
   requireSameOrg — enforces user belongs to
   the org being accessed (prevents cross-org access)
   Use on any route that takes :orgId or ?org_id
───────────────────────────────────── */
export const requireSameOrg = (req, res, next) => {
  const userRole = req.session?.user?.role;

  // Super admins can access any org
  if (userRole === "super_admin") return next();

  const targetOrgId = req.params.orgId || req.query.org_id || req.body.org_id;

  if (!targetOrgId) return next(); // no specific org requested, tenantMiddleware will scope

  if (req.session.user.org_id !== targetOrgId) {
    return res.status(403).json({ error: "Cross-organisation access denied" });
  }
  next();
};

/* ─────────────────────────────────────
   checkFeatureFlag — require a specific feature
   enabled for the user's org plan.
   Usage: checkFeatureFlag('ai_tools')
───────────────────────────────────── */
export const checkFeatureFlag = (featureName) => async (req, res, next) => {
  // Super admins bypass all feature flags
  if (req.userRole === "super_admin") return next();

  const orgId = req.orgId;
  if (!orgId) return res.status(403).json({ error: "No organisation context" });

  try {
    const { data: org } = await supabase
      .from("organisations")
      .select("feature_flags, plan_name, status")
      .eq("id", orgId)
      .single();

    if (!org) return res.status(403).json({ error: "Organisation not found" });
    if (org.status !== "active" && org.status !== "trial") {
      return res.status(403).json({ error: "Organisation account is " + org.status });
    }

    // Check plan feature
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("features")
      .eq("name", org.plan_name)
      .maybeSingle();

    const planFeatures = plan?.features || {};
    const orgOverrides = org.feature_flags || {};

    // org-level override takes precedence over plan
    const allowed = featureName in orgOverrides
      ? orgOverrides[featureName]
      : planFeatures[featureName] ?? false;

    if (!allowed) {
      return res.status(403).json({
        error: `Feature '${featureName}' not available on your current plan`,
        upgrade_required: true,
        current_plan: org.plan_name,
      });
    }

    next();
  } catch (err) {
    logger.error({ err: err }, "checkFeatureFlag");
    return res.status(500).json({ error: "Feature check failed" });
  }
};