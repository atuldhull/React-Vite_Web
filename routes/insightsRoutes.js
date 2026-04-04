/**
 * Insights Routes — Recommendations + Health Metrics + Admin Analytics
 */

import express from "express";
import { getRecommendations, getEventHealth, getAdminInsights } from "../controllers/insightsController.js";
import { requireAuth, requireTeacher, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Student — personalized event recommendations
router.get("/recommendations", requireAuth, getRecommendations);

// Teacher/Admin — per-event health metrics
router.get("/event/:id/health", requireTeacher, getEventHealth);

// Admin — platform-wide insights
router.get("/admin", requireAdmin, getAdminInsights);

export default router;
