/**
 * Health + readiness routes. Mounted at /api/health and /api/ready
 * directly (NOT under a single /api/health prefix) so monitors can
 * use the conventional URLs.
 *
 * Both endpoints are public — uptime monitors and load balancers
 * cannot authenticate. The responses leak no secrets.
 */

import express from "express";
import { getHealth, getReady } from "../controllers/healthController.js";

const router = express.Router();

router.get("/health", getHealth);
router.get("/ready",  getReady);

export default router;
