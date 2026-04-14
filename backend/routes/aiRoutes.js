import express from "express";
import { generateAndStoreQuestion, previewQuestion } from "../controllers/aiController.js";
import { requireAdmin } from "../middleware/authMiddleware.js";
import { aiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Rate-limited (aiLimiter): each call hits OpenRouter and incurs API
// cost. Auth is ALSO required — unauthenticated clients can't reach
// these — but auth alone doesn't bound spend.
router.post("/generate-question", requireAdmin, aiLimiter, generateAndStoreQuestion);
router.get("/preview",            requireAdmin, aiLimiter, previewQuestion);

export default router;
