/**
 * Insights Routes — Recommendations + Health Metrics + Admin Analytics
 */

import express from "express";
import { getRecommendations, getEventHealth, getAdminInsights } from "../controllers/insightsController.js";
import { requireAuth, requireTeacher, requireAdmin, checkFeatureFlag } from "../middleware/authMiddleware.js";

const router = express.Router();

// Student — personalized event recommendations
router.get("/recommendations", requireAuth, getRecommendations);

// Teacher/Admin — per-event health metrics (requires analytics feature)
router.get("/event/:id/health", requireTeacher, checkFeatureFlag("analytics"), getEventHealth);

// Admin — platform-wide insights (requires analytics feature)
router.get("/admin", requireAdmin, checkFeatureFlag("analytics"), getAdminInsights);

export default router;
