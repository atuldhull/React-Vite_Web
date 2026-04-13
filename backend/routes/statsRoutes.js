/**
 * Public platform stats route. Mounted at /api/stats.
 */
import express from "express";
import { getPublicStats } from "../controllers/statsController.js";

const router = express.Router();

router.get("/public", getPublicStats);

export default router;
