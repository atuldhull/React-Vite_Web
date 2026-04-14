/**
 * Ambient TypeScript declarations for the backend.
 *
 * Lives at the project root of the backend so any .js file that
 * opts into type-checking (`// @ts-check` at top) gets the augmented
 * Express types automatically — no per-file imports needed.
 *
 * What this file declares:
 *   - `req.id`          set by requestIdMiddleware (Phase 1.4)
 *   - `req.userId`      set by requireAuth + role guards
 *   - `req.userRole`    set by requireAuth
 *   - `req.orgId`       set by injectTenant (Phase 2.2)
 *   - `req.db`          tenant-scoped Supabase wrapper (Phase 2.2)
 *   - `req.session.user` Phase-2.3 session-user shape
 *   - `req.rawBody`     buffer captured by express.json verify cb on
 *                       the Razorpay webhook (server.js)
 *
 * Without these, every typed controller would have to cast `req as any`
 * to read req.userId / req.orgId — defeating the point.
 */

import "express-session";

declare module "express-session" {
  interface SessionData {
    /**
     * Set by authController.login on successful sign-in. Cleared by
     * destroySession on logout. ProtectedRoute middleware reads
     * `req.session?.user` to decide whether to 401.
     */
    user?: {
      id:         string;
      email:      string;
      name:       string;
      role:       "student" | "teacher" | "admin" | "super_admin";
      title?:     string;
      xp?:        number;
      org_id:     string | null;
      org_name:   string | null;
      org_slug?:  string | null;
      org_color?: string;
      org_plan?:  string;
      is_active:  boolean;
    };
    /** Set by csrfProtection.getCsrfTokenHandler to force session save. */
    csrfBound?: boolean;
    /** Set by superAdmin tooling when impersonating an org. */
    impersonating_org_id?: string;
  }
}

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * The tenant-scoped Supabase wrapper installed by `injectTenant`.
 * Looks like Supabase's own client but auto-applies eq("org_id", ...)
 * on tenant tables. See backend/middleware/tenantMiddleware.js.
 */
export interface TenantDb {
  /** The wrapped Supabase client. Bypass scoping with `req.db.raw`. */
  raw:   SupabaseClient;
  /** Org-scoped from() — Proxies tenant-table calls to add the filter. */
  from:  (table: string) => any;
  /** Helper to fetch the current org's row (joined with subscription_plans). */
  getOrg: () => Promise<unknown>;
  /** Inserts an audit_logs row tagged with the current actor + org. */
  audit:  (action: string, targetType: string, targetId: string, metadata?: unknown) => Promise<void>;
}

declare global {
  namespace Express {
    interface Request {
      /** Per-request UUID set by requestIdMiddleware (Phase 1.4). */
      id?: string;

      /** Set by requireAuth / role guards (Phase 1.6 / 2.2). */
      userId?:   string;
      userRole?: "student" | "teacher" | "admin" | "super_admin";
      orgId?:    string | null;

      /** Tenant-scoped DB wrapper installed by injectTenant. */
      db?: TenantDb;

      /** Set by superAdmin's audit endpoint chain. */
      targetOrg?: string;

      /**
       * Raw request body bytes. Captured by the express.json verify
       * callback in app.js ONLY for /api/payment/webhook so the
       * Razorpay HMAC signature can verify against the exact bytes
       * Razorpay signed. JSON.stringify(req.body) is NOT byte-stable.
       */
      rawBody?: Buffer;
    }
  }
}

// Marker export so the file is treated as a module, not a script.
export {};
