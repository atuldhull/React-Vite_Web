/**
 * /api/problems/* routes.
 *
 * READ — requireAuth (any logged-in student).
 * WRITE — requireTeacher (the bulk-import is admin-only; per-student
 *        submission is a follow-up).
 *
 * Validation: validateBody on POST + PATCH. GET endpoints validate
 * query params inline in the controller (light enums + length caps).
 */

import { Router } from "express";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";
import { validateBody } from "../validators/common.js";
import {
  listProblems,
  getFacets,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
} from "../controllers/problemController.js";
import { createProblemSchema, updateProblemSchema } from "../validators/problems.js";

const router = Router();

// All routes need a logged-in user. The repo is meant to be a
// students-only resource (per the brief: "available to everyone
// but only after login") — no anonymous browse.
router.use(requireAuth);

// Reads — any authed student.
router.get("/",          listProblems);
router.get("/facets",    getFacets);
router.get("/:slugOrId", getProblem);

// Writes — admin / teacher only.
router.post("/",       requireTeacher, validateBody(createProblemSchema), createProblem);
router.patch("/:id",   requireTeacher, validateBody(updateProblemSchema), updateProblem);
router.delete("/:id",  requireTeacher, deleteProblem);

export default router;
