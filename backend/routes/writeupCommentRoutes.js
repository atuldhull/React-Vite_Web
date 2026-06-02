/**
 * /api/writeups/* — comments on problem_writeups.
 *
 * Read is auth-gated like the rest of the catalogue. Writes are
 * auth-gated AND rate-limited via commentsLimiter (30/hr/user, the
 * same bucket as challenge comments — generous for normal discussion,
 * tight enough to stop a runaway client from flooding a writeup).
 *
 * Notes on the route shape:
 *   - List + create are keyed on :writeupId so the URL reads like
 *     a sub-resource of the writeup.
 *   - Edit + delete are keyed on :commentId because once a comment
 *     exists, the writeup it belongs to is immutable — no need to
 *     repeat it in the path.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { commentsLimiter } from "../middleware/rateLimiter.js";
import {
  listComments,
  createComment,
  editComment,
  deleteComment,
} from "../controllers/writeupCommentController.js";

const router = Router();

router.use(requireAuth);

router.get(   "/:writeupId/comments",          listComments);
router.post(  "/:writeupId/comments",          commentsLimiter, createComment);
router.patch( "/comments/:commentId",          commentsLimiter, editComment);
router.delete("/comments/:commentId",          deleteComment);

export default router;
