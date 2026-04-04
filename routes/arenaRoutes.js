import express from "express";
import { submitSolve, getHistory, getStats } from "../controllers/arenaController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/submit",  requireAuth, submitSolve);
router.get("/history",  requireAuth, getHistory);
router.get("/stats",    requireAuth, getStats);

export default router;
