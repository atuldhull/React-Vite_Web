import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import * as rc from "../controllers/referralController.js";

const router = Router();

// Public — validate code (no auth needed, used on register page)
router.get("/validate/:code", rc.validateCode);

// Public — referral leaderboard
router.get("/leaderboard", rc.getReferralLeaderboard);

// Auth required
router.get("/code", requireAuth, rc.getMyReferralCode);
router.post("/apply", requireAuth, rc.applyReferralCode);
router.get("/stats", requireAuth, rc.getMyReferralStats);

export default router;
