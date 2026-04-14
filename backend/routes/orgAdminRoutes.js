/**
 * routes/orgAdminRoutes.js
 *
 * Organisation-level admin routes.
 * All guarded by requireAdmin + injectTenant (auto org scoping).
 */

import express from "express";
import { requireAdmin }  from "../middleware/authMiddleware.js";
import { injectTenant }  from "../middleware/tenantMiddleware.js";
import { validateBody }  from "../validators/common.js";
import {
  inviteUserSchema,
  updateUserRoleSchema,
  toggleOrgFeatureSchema,
} from "../validators/admin.js";
import {
  getOrgStats,
  listOrgUsers,
  updateUserRole,
  setUserStatus,
  inviteUser,
  getBranding,
  updateBranding,
  getOrgAnalytics,
  getOrgFeatures,
  toggleOrgFeature,
} from "../controllers/orgAdminController.js";

const router = express.Router();

// All routes: must be admin or above + tenant injected
router.use(requireAdmin, injectTenant);

/* ── Dashboard ── */
router.get("/org-stats",  getOrgStats);
router.get("/analytics",  getOrgAnalytics);

/* ── User Management ── */
router.get("/users",                    listOrgUsers);
router.patch("/users/:userId/role",     validateBody(updateUserRoleSchema), updateUserRole);
router.post("/users/:userId/suspend",   setUserStatus(false));
router.post("/users/:userId/activate",  setUserStatus(true));
router.post("/invite",                  validateBody(inviteUserSchema),     inviteUser);

/* ── Branding ── */
router.get("/branding",   getBranding);
router.patch("/branding", updateBranding);

/* ── Feature Management ── */
router.get("/features",    getOrgFeatures);
router.patch("/features",  validateBody(toggleOrgFeatureSchema), toggleOrgFeature);

export default router;