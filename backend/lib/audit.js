/**
 * Audit-log writer (standalone — no tenant-proxy dependency).
 *
 * The existing req.db.audit(...) helper in tenantMiddleware.js works
 * great for in-org actions (role change, payment flip, certificate
 * issue) but it can't help with the events that happen BEFORE the
 * tenant proxy is hydrated — login success/failure, password reset
 * with a Supabase recovery token, register flow. Those need to land
 * in the audit log too, so an operator can answer "did Alice log in
 * yesterday from a new IP" without joining session-cookie traces.
 *
 * This helper takes every field explicitly — no implicit ALS reads —
 * so it works for any code path including background jobs.
 *
 * Failure mode: audit writes are best-effort. A failed insert logs a
 * warning and returns; we never break the user's real request to
 * record an audit row. Supabase outage shouldn't take auth down.
 */

import supabase from "../config/supabase.js";
import { logger } from "./../config/logger.js";

/**
 * Common action names — keep them stable strings so a future
 * /super-admin/audit-logs filter UI can list them in a dropdown
 * without grep-mining the codebase. Add new ones here as new
 * audited events appear.
 */
export const AuditAction = Object.freeze({
  LOGIN_SUCCESS:        "auth.login.success",
  LOGIN_FAILED:         "auth.login.failed",
  ACCOUNT_LOCKED:       "auth.account.locked",
  PASSWORD_CHANGED:     "auth.password.changed",
  PASSWORD_RESET:       "auth.password.reset",       // via recovery token
  ROLE_CHANGED:         "user.role.changed",
  PAYMENT_VERIFIED:     "payment.verified",
  PAYMENT_WEBHOOK:      "payment.webhook.received",
  IMPERSONATION_START:  "admin.impersonation.start",
  IMPERSONATION_STOP:   "admin.impersonation.stop",
});

/**
 * Insert a single audit row. Always async (so the caller can await
 * when ordering matters) but the caller is free to fire-and-forget
 * — failures only log, never throw.
 *
 * @param {object}  opts
 * @param {string} [opts.actorId]    user_id of the actor (null for pre-auth)
 * @param {string} [opts.actorRole]  actor's role at time of action (null if unknown)
 * @param {string} [opts.orgId]      org context of the action
 * @param {string}  opts.action      from AuditAction or any stable verb-noun string
 * @param {string} [opts.targetType] entity type the action affected ('user', 'org', 'payment', ...)
 * @param {string} [opts.targetId]   primary key of the target row
 * @param {object} [opts.metadata]   extra JSON context (email attempted, plan, etc.)
 * @param {import("express").Request} [opts.req]  request object (for ip + UA)
 */
export async function writeAudit(opts) {
  try {
    const row = {
      org_id:      opts.orgId      || null,
      actor_id:    opts.actorId    || null,
      actor_role:  opts.actorRole  || "unknown",
      action:      opts.action,
      target_type: opts.targetType || null,
      target_id:   opts.targetId != null ? String(opts.targetId) : null,
      metadata:    opts.metadata   || {},
      ip_address:  opts.req?.ip || null,
      user_agent:  opts.req?.headers?.["user-agent"] || null,
    };
    const { error } = await supabase.from("audit_logs").insert(row);
    if (error) {
      logger.warn({ err: error, action: opts.action }, "audit write failed");
    }
  } catch (err) {
    // Catches network-level throws (Supabase unreachable). NEVER
    // re-throws — the caller's real request keeps going.
    logger.warn({ err, action: opts.action }, "audit write threw");
  }
}
