import express from "express";
import { generateAndStoreQuestion, previewQuestion } from "../controllers/aiController.js";
import { requireAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// These routes require admin (generating questions from frontend)
router.post("/generate-question", requireAdmin, generateAndStoreQuestion);
router.get("/preview",            requireAdmin, previewQuestion);

export default router;
