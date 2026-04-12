/**
 * Achievement Routes
 *
 * /api/achievements — catalog + user unlocks + admin grant
 */

import express from "express";
import {
  getAchievements, getMyAchievements, getUserAchievements, grantAchievement,
} from "../controllers/event/index.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/",              getAchievements);           // Public — list all achievements
router.get("/me",            requireAuth, getMyAchievements);  // My unlocked achievements
router.get("/user/:userId",  getUserAchievements);       // Public — user's achievements
router.post("/grant",        requireAdmin, grantAchievement);  // Admin — manually grant

export default router;
