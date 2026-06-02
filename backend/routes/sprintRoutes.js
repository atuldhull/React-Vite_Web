/**
 * /api/sprints/* — Solution Sprints (migration 43).
 *
 * Reads are auth-gated like the rest of the catalogue. The
 * pin / unpin endpoints are admin/teacher-only — they manually
 * decide the next featured problem.
 */

import { Router } from "express";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";
import {
  getActiveSprint,
  getLeaderboard,
  listSprints,
  pinNextSprint,
  unpinNextSprint,
} from "../controllers/sprintController.js";

const router = Router();

router.use(requireAuth);

router.get("/active",       getActiveSprint);   // BEFORE /:slug — literal-segment match
router.get("/leaderboard",  getLeaderboard);
router.get("/",             listSprints);

// Admin / teacher — pin queue management.
router.post(  "/pin",  requireTeacher, pinNextSprint);
router.delete("/pin",  requireTeacher, unpinNextSprint);

export default router;
