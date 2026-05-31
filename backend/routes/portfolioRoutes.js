/**
 * /api/portfolio/* routes.
 *
 * THREE endpoints, two auth tiers:
 *   GET  /:handle  — PUBLIC. No login. Returns the aggregated
 *                    portfolio if owner opted in, 404 otherwise.
 *   GET  /me       — AUTH. Settings read for the owner.
 *   PATCH /me      — AUTH. Settings write for the owner.
 *
 * The PUBLIC endpoint is the one that makes this surface useful for
 * LinkedIn / résumé URLs. Everything else lives behind requireAuth.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  getPublicPortfolio,
  getMyPortfolioSettings,
  updateMyPortfolioSettings,
} from "../controllers/portfolioController.js";

const router = Router();

// Owner-only routes FIRST so the literal `/me` segment matches before
// the `:handle` parameter route.
router.get("/me",    requireAuth, getMyPortfolioSettings);
router.patch("/me",  requireAuth, updateMyPortfolioSettings);

// Public — no requireAuth. Be conservative with what gets returned
// in the controller; everything sensitive must stay server-side.
router.get("/:handle", getPublicPortfolio);

export default router;
