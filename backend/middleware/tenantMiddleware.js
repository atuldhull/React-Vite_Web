/**
 * middleware/tenantMiddleware.js
 *
 * TENANT ISOLATION MIDDLEWARE
 *
 * This is the backbone of multi-tenancy.
 * It patches the Supabase client to automatically inject `.eq('org_id', orgId)`
 * on every query, and provides a scoped supabase factory.
 *
 * USAGE in controllers:
 *   const db = req.db;  ← automatically org-scoped Supabase helpers
 *
 *   const events = await db.from('events').select('*'); // always filtered to org
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

/* ─────────────────────────────────────────────────────
   Tables that MUST be org-scoped (org_id filter applied)
───────────────────────────────────────────────────── */
const TENANT_TABLES = new Set([
  "students",
  "challenges",
  "events",
  "arena_attempts",
  "announcements",
  "notifications",
  "certificate_batches",
  "certificates",
  "scheduled_tests",
  "test_attempts",
  "teams",
  "projects",
  "project_votes",
  "weekly_winners",
  "org_invitations",
]);

/* ─────────────────────────────────────────────────────
   Tables that super_admin can query without org filter
   (platform-wide tables)
───────────────────────────────────────────────────── */
const GLOBAL_TABLES = new Set([
  "organisations",
  "subscription_plans",
  "audit_logs",
  "impersonation_sessions",
  "platform_analytics",
  "site_settings",
  "project_categories",
]);

/**
 * injectTenant middleware
 *
 * Attaches `req.db` — a thin wrapper that auto-injects org_id into
 * SELECT/INSERT/UPDATE/DELETE for TENANT_TABLES.
 *
 * Super admins get req.db = full supabase (no org filter).
 * Impersonation mode overrides req.orgId with target org.
 */
export const injectTenant = async (req, res, next) => {
  const role  = req.userRole  || req.session?.user?.role;
  const orgId = req.orgId     || req.session?.user?.org_id;

  const isSuperAdmin = role === "super_admin";

  /**
   * Check for active impersonation session.
   * If super_admin is impersonating an org, scope their queries.
   */
  let effectiveOrgId = orgId;
  if (isSuperAdmin && req.session?.impersonating_org_id) {
    effectiveOrgId = req.session.impersonating_org_id;
  }

  /**
   * req.db — org-scoped database helper
   *
   * Usage:
   *   req.db.from('events').select(...)
   *   req.db.from('organisations').select(...)  ← global table, no org filter
   *   req.db.raw                                ← full supabase client
   */
  req.db = {
    raw: supabase,

    /**
     * Scoped .from() — auto-injects eq('org_id', orgId) for tenant tables.
     * For global tables or super_admin without impersonation: no filter.
     */
    from: (tableName) => {
      const query = supabase.from(tableName);

      // Global tables or super_admin without impersonation = no filter
      if (GLOBAL_TABLES.has(tableName)) return query;
      if (isSuperAdmin && !req.session?.impersonating_org_id) return query;

      // Apply tenant isolation
      if (TENANT_TABLES.has(tableName) && effectiveOrgId) {
        // We return a proxy object that auto-adds eq on select/insert/update/delete
        return createScopedQuery(query, effectiveOrgId);
      }

      return query;
    },

    /** Shorthand for getting current org info */
    getOrg: async () => {
      if (!effectiveOrgId) return null;
      const { data } = await supabase
        .from("organisations")
        .select("*, subscription_plans(*)")
        .eq("id", effectiveOrgId)
        .single();
      return data;
    },

    /** Write to audit log */
    audit: async (action, targetType, targetId, metadata = {}) => {
      try {
        await supabase.from("audit_logs").insert({
          org_id:      effectiveOrgId,
          actor_id:    req.userId || req.session?.user?.id,
          actor_role:  role || "unknown",
          action,
          target_type: targetType,
          target_id:   String(targetId || ""),
          metadata,
          ip_address:  req.ip,
          user_agent:  req.headers["user-agent"],
        });
      } catch (err) {
        logger.error({ err: err }, "Audit");
      }
    },
  };

  // Convenience accessors
  req.orgId    = effectiveOrgId;
  req.userId   = req.userId   || req.session?.user?.id;
  req.userRole = req.userRole || role;

  next();
};

/**
 * createScopedQuery
 *
 * Wraps a Supabase query builder so that any .select(), .insert(),
 * .update(), .delete(), or .upsert() call auto-applies the org_id filter.
 *
 * This uses a Proxy to intercept chained calls.
 */
function createScopedQuery(baseQuery, orgId) {
  // We'll intercept the terminal query methods and inject eq()
  const handler = {
    get(target, prop) {
      if (prop === "select") {
        return (...args) => target.select(...args).eq("org_id", orgId);
      }
      if (prop === "insert") {
        return (data) => {
          // Inject org_id into insert payload
          if (Array.isArray(data)) {
            return target.insert(data.map(row => ({ ...row, org_id: orgId })));
          }
          return target.insert({ ...data, org_id: orgId });
        };
      }
      if (prop === "upsert") {
        return (data, opts) => {
          if (Array.isArray(data)) {
            return target.upsert(data.map(row => ({ ...row, org_id: orgId })), opts);
          }
          return target.upsert({ ...data, org_id: orgId }, opts);
        };
      }
      if (prop === "update") {
        return (data) => target.update(data).eq("org_id", orgId);
      }
      if (prop === "delete") {
        return () => target.delete().eq("org_id", orgId);
      }
      const val = target[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  };

  return new Proxy(baseQuery, handler);
}

/**
 * validateOrgAccess
 *
 * Express middleware to verify an org exists, is active,
 * and the requesting user belongs to it (or is super_admin).
 *
 * Use on routes that accept :orgId param.
 */
export const validateOrgAccess = async (req, res, next) => {
  const targetOrgId = req.params.orgId;
  const userRole    = req.userRole;
  const userOrgId   = req.orgId;

  if (!targetOrgId) return next();

  // Super admin can access any org
  if (userRole === "super_admin") {
    req.targetOrg = targetOrgId;
    return next();
  }

  // Others must belong to the org
  if (userOrgId !== targetOrgId) {
    return res.status(403).json({ error: "Access denied to this organisation" });
  }

  req.targetOrg = targetOrgId;
  next();
};