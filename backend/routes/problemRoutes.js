/**
 * /api/problems/* routes.
 *
 * READ — requireAuth (any logged-in student).
 * WRITE — requireTeacher (the bulk-import is admin-only; per-student
 *        submission is a follow-up).
 *
 * Engagement endpoints (interest beacons, writeups, votes) are all
 * student-writeable but still requireAuth — they self-scope on
 * req.userId so a student can only toggle their own interest /
 * upsert their own writeup / toggle their own vote.
 *
 * Validation: validateBody on POST + PATCH. GET endpoints validate
 * query params inline in the controller (light enums + length caps).
 */

import { Router } from "express";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";
import { validateBody } from "../validators/common.js";
import { aiLimiter } from "../middleware/rateLimiter.js";
import {
  listProblems,
  getFacets,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  getEngagement,
  toggleInterest,
  upsertWriteup,
  deleteWriteup,
  toggleWriteupVote,
  askProblemAi,
  getDailyProblem,
  dailyCheckin,
} from "../controllers/problemController.js";
import { createProblemSchema, updateProblemSchema, writeupSchema } from "../validators/problems.js";

const router = Router();

// All routes need a logged-in user. The repo is meant to be a
// students-only resource (per the brief: "available to everyone
// but only after login") — no anonymous browse.
router.use(requireAuth);

// Reads — any authed student.
router.get("/facets",                getFacets);
router.get("/daily",                 getDailyProblem);   // BEFORE /:slugOrId — literal-segment match wins
router.post("/daily/checkin",        dailyCheckin);
router.get("/:slugOrId/engagement",  getEngagement);     // BEFORE /:slugOrId — exact suffix match
router.get("/:slugOrId",             getProblem);
router.get("/",                      listProblems);

// Engagement writes — any authed student, self-scoped in the controller.
router.post("/:slugOrId/interest",                       toggleInterest);
router.post("/:slugOrId/writeups",  validateBody(writeupSchema), upsertWriteup);
router.delete("/:slugOrId/writeups/:writeupId",          deleteWriteup);
router.post("/writeups/:writeupId/vote",                 toggleWriteupVote);

// AI study companion — Socratic Q&A scoped to one problem. aiLimiter
// is shared with /bot/chat and /comments/ask-ai (20/hr/user budget).
router.post("/:slugOrId/ai-ask",  aiLimiter, askProblemAi);

// Catalogue writes — admin / teacher only.
router.post("/",       requireTeacher, validateBody(createProblemSchema), createProblem);
router.patch("/:id",   requireTeacher, validateBody(updateProblemSchema), updateProblem);
router.delete("/:id",  requireTeacher, deleteProblem);

export default router;
