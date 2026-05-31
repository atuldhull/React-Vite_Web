/**
 * /api/bookmarks/* routes.
 *
 * All auth-gated. Every endpoint self-scopes on req.userId — a
 * student can only see / mutate their own saves.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  toggleBookmark,
  listMyBookmarks,
  bookmarkState,
} from "../controllers/bookmarkController.js";

const router = Router();

router.use(requireAuth);

router.get("/state",          bookmarkState);
router.get("/",               listMyBookmarks);
router.post("/:type/:id",     toggleBookmark);

export default router;
