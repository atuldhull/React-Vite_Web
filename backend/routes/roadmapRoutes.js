/**
 * /api/roadmaps/* routes.
 *
 * READ — requireAuth (logged-in students only). The brief — "available
 * to everyone but only after login" — extends to roadmaps too.
 * WRITE — TODO: admin-curation surface lands in a follow-up.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  listRoadmaps,
  getRoadmap,
  toggleStepDone,
} from "../controllers/roadmapController.js";

const router = Router();

router.use(requireAuth);

router.get("/",        listRoadmaps);
router.get("/:slug",   getRoadmap);
router.post("/steps/:stepId/toggle", toggleStepDone);

export default router;
