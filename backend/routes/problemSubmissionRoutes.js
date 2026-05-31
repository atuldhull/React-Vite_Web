/**
 * /api/problem-submissions/* routes.
 *
 * Student endpoints:
 *   POST   /draft-from-url   (auth + aiLimiter — costs OpenRouter $)
 *   POST   /                  create a submission (auth)
 *   GET    /mine              own submission list (auth)
 *
 * Moderator endpoints:
 *   GET    /queue             pending list (teacher / admin)
 *   POST   /:id/approve       move to problem_statements (teacher / admin)
 *   POST   /:id/reject        with reason (teacher / admin)
 */

import { Router } from "express";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";
import { aiLimiter } from "../middleware/rateLimiter.js";
import {
  draftFromUrl,
  createSubmission,
  listMySubmissions,
  listQueue,
  approveSubmission,
  rejectSubmission,
} from "../controllers/problemSubmissionController.js";

const router = Router();

router.use(requireAuth);

router.post("/draft-from-url", aiLimiter, draftFromUrl);
router.post("/",               createSubmission);
router.get("/mine",            listMySubmissions);

router.get("/queue",           requireTeacher, listQueue);
router.post("/:id/approve",    requireTeacher, approveSubmission);
router.post("/:id/reject",     requireTeacher, rejectSubmission);

export default router;
