/**
 * /api/search — global free-text search across problems, roadmaps,
 * writeups, and public portfolios.
 *
 * Single route, single handler. Auth-gated so the command palette
 * surface is a logged-in convenience; sub-queries already filter
 * each table down to its publicly-safe rows.
 *
 * Rate limiter: searchLimiter caps 120 req/min/user. The palette
 * debounces at 250ms in the client, so a typical user submits at
 * most ~4 req/sec — the limiter only kicks in for runaway clients
 * or scripted abuse.
 */

import express from "express";
import { searchAll } from "../controllers/searchController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { searchLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.get("/", requireAuth, searchLimiter, searchAll);

export default router;
