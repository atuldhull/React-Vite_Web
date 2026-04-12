/**
 * controllers/superAdminController.js
 *
 * Barrel re-export — all super-admin handlers live in ./superAdmin/.
 * routes/superAdminRoutes.js imports from here; behaviour is unchanged.
 */

export { getPlatformAnalytics, getGlobalLeaderboard, getOrgStats } from "./superAdmin/analytics.js";

export {
  listOrganisations,
  createOrganisation,
  updateOrganisation,
  setOrgStatus,
  forceSuspendOrgUsers,
  deleteOrganisation,
} from "./superAdmin/organisations.js";

export { assignPlan, setFeatureFlags, listPlans, listPlatformPayments } from "./superAdmin/plans.js";

export { startImpersonation, stopImpersonation } from "./superAdmin/impersonation.js";

export { getAuditLogs } from "./superAdmin/auditLogs.js";
