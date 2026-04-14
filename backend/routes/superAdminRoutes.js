/**
 * routes/superAdminRoutes.js
 *
 * All routes guarded by requireSuperAdmin + injectTenant
 */

import express from "express";
import { requireSuperAdmin } from "../middleware/authMiddleware.js";
import { injectTenant }      from "../middleware/tenantMiddleware.js";
import { logger }            from "../config/logger.js";
import {
  getPlatformAnalytics,
  listOrganisations,
  createOrganisation,
  updateOrganisation,
  setOrgStatus,
  assignPlan,
  setFeatureFlags,
  startImpersonation,
  stopImpersonation,
  getAuditLogs,
  getGlobalLeaderboard,
  getOrgStats,
  forceSuspendOrgUsers,
  deleteOrganisation,
  listPlans,
  listPlatformPayments,
} from "../controllers/superAdminController.js";

const router = express.Router();

// All super-admin routes require super_admin role + tenant context
router.use(requireSuperAdmin, injectTenant);

// Inject audit logger — structured log for every platform-admin
// action (audit_logs table can be added later for persistent trail).
router.use((req, res, next) => {
  req.db = {
    audit: async (action, entity, entityId, meta) => {
      logger.info(
        { action, entity, entityId, actor: req.userId || null, meta: meta || null },
        "audit super-admin action"
      );
    },
  };
  next();
});

/* ── Analytics ── */
router.get("/analytics",          getPlatformAnalytics);
router.get("/leaderboard",        getGlobalLeaderboard);
router.get("/audit-logs",         getAuditLogs);

/* ── Organisations ── */
router.get("/organisations",                listOrganisations);
router.post("/organisations",               createOrganisation);
router.patch("/organisations/:orgId",       updateOrganisation);
router.delete("/organisations/:orgId",      deleteOrganisation);

/* ── Org Actions ── */
router.post("/organisations/:orgId/suspend",        setOrgStatus("suspended"));
router.post("/organisations/:orgId/activate",       setOrgStatus("active"));
router.post("/organisations/:orgId/plan",           assignPlan);
router.put("/organisations/:orgId/features",        setFeatureFlags);
router.get("/organisations/:orgId/stats",           getOrgStats);
router.post("/organisations/:orgId/force-suspend-users", forceSuspendOrgUsers);

/* ── Impersonation ── */
router.post("/impersonate/:orgId",  startImpersonation);
router.delete("/impersonate",       stopImpersonation);

/* ── Plans ── */
router.get("/plans",    listPlans);
router.get("/payments", listPlatformPayments);

export default router;