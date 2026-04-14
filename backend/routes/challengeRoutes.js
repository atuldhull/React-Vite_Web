import express from "express";
import {
  getCurrentChallenge,
  getNextChallenge,
  getAllChallenges,
  getChallengeById,
  createChallenge,
  updateChallenge,
  deleteChallenge,
  toggleChallenge,
} from "../controllers/challengeController.js";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { validateBody } from "../validators/common.js";
import { createChallengeSchema, updateChallengeSchema } from "../validators/challenges.js";

const router = express.Router();

router.get("/current",  getCurrentChallenge);
router.get("/next",     getNextChallenge);    // ← NEW: returns random unsolved challenge
router.get("/all",      getAllChallenges);
router.get("/:id",      getChallengeById);

// Admin-only
router.post("/",              requireAdmin, validateBody(createChallengeSchema), createChallenge);
router.patch("/:id",          requireAdmin, validateBody(updateChallengeSchema), updateChallenge);
router.delete("/:id",         requireAdmin, deleteChallenge);
router.patch("/:id/toggle",   requireAdmin, toggleChallenge);

export default router;
