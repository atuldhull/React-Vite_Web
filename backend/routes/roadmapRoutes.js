/**
 * /api/roadmaps/* routes.
 *
 * READ — requireAuth.
 * STUDENT AUTHORING — requireAuth; ownership enforced in controller.
 * MODERATION — requireTeacher (admin / teacher / super_admin).
 *
 * Route order: literal segments BEFORE the `:slug` capture so
 * /roadmaps/admin/queue isn't swallowed by /roadmaps/:slug.
 */

import { Router } from "express";
import { requireAuth, requireTeacher } from "../middleware/authMiddleware.js";
import {
  listRoadmaps,
  getRoadmap,
  toggleStepDone,
  createRoadmap,
  updateRoadmap,
  deleteRoadmap,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  submitForReview,
  withdrawSubmission,
  listPendingQueue,
  approveRoadmap,
  rejectRoadmap,
} from "../controllers/roadmapController.js";

const router = Router();

router.use(requireAuth);

// ── Moderation queue (literal segment — must precede :slug) ──
router.get("/admin/queue",        requireTeacher, listPendingQueue);

// ── Authoring (literal segments before :slug) ──
router.post("/",                  createRoadmap);
router.patch("/:id",              updateRoadmap);
router.delete("/:id",             deleteRoadmap);
router.post("/:id/steps",         addStep);
router.post("/:id/reorder",       reorderSteps);
router.post("/:id/submit",        submitForReview);
router.post("/:id/withdraw",      withdrawSubmission);
router.post("/:id/approve",       requireTeacher, approveRoadmap);
router.post("/:id/reject",        requireTeacher, rejectRoadmap);

router.patch("/steps/:stepId",        updateStep);
router.delete("/steps/:stepId",       deleteStep);
router.post("/steps/:stepId/toggle",  toggleStepDone);

// ── Reads (`:slug` last) ──
router.get("/",        listRoadmaps);
router.get("/:slug",   getRoadmap);

export default router;
