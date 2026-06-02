/**
 * controllers/writeupCommentController.js
 *
 * Plain prose comments on problem_writeups (migration 42).
 *
 * The CRUD shape mirrors problemController's writeup handlers:
 *   - GET    /api/writeups/:writeupId/comments  — public-list
 *   - POST   /api/writeups/:writeupId/comments  — create (auth)
 *   - PATCH  /api/writeups/comments/:commentId  — edit own
 *   - DELETE /api/writeups/comments/:commentId  — author or moderator
 *
 * Soft-delete contract: deleted_at IS NOT NULL hides the row from
 * the list response (we still return a placeholder so the index
 * doesn't lose its shape — comment-A replied to "comment 3", we want
 * to keep the count consistent).
 *
 * Notifications:
 *   • on first comment by a non-author, ping the writeup author
 *   • the author commenting on their own writeup never pings
 *
 * Cross-tenant: problem_writeups is a platform-wide table (migration
 * 35), so the comments live there too. `students` lookups for author
 * names are cross-tenant by design — the same pattern as the writeup
 * detail view itself.
 */

import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";
import { logger } from "../config/logger.js";
import { sendNotification } from "./notificationController.js";

const MAX_BODY = 2000;
const PAGE_SIZE = 50;

// ════════════════════════════════════════════════════════════════
// GET /api/writeups/:writeupId/comments
//
// Returns oldest-first so the conversation reads top-to-bottom like
// a thread. We cap at PAGE_SIZE per page because most writeups will
// see <10 comments — pagination is belt-and-braces against a viral
// writeup that gets 200+ replies.
// ════════════════════════════════════════════════════════════════
export const listComments = async (req, res) => {
  try {
    const writeupId = String(req.params.writeupId || "").slice(0, 100);
    if (!writeupId) return res.status(400).json({ error: "writeupId required" });

    const { data: comments, error } = await supabase
      .from("writeup_comments")
      .select("id, writeup_id, author_id, body, edited, deleted_at, created_at, updated_at")
      .eq("writeup_id", writeupId)
      .order("created_at", { ascending: true })
      .limit(PAGE_SIZE);
    if (error) throw error;

    const rows = comments || [];
    if (!rows.length) return res.json({ data: [], total: 0 });

    // Resolve author names + avatars in one batch.
    const authorIds = [...new Set(rows.map((c) => c.author_id))];
    const { data: authors } = await supabase
      .from("students")
      .select("user_id, name, avatar_url")
      .in("user_id", authorIds);
    const byId = new Map((authors || []).map((s) => [s.user_id, s]));

    const viewerId = req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);

    const out = rows.map((c) => {
      const author = byId.get(c.author_id) || {};
      const isMine = c.author_id === viewerId;
      const isDeleted = !!c.deleted_at;
      return {
        id:           c.id,
        writeup_id:   c.writeup_id,
        author_id:    c.author_id,
        author_name:  author.name || "User",
        author_avatar: author.avatar_url || null,
        body:         isDeleted ? null : c.body,
        edited:       c.edited,
        is_deleted:   isDeleted,
        is_mine:      isMine,
        can_edit:     isMine && !isDeleted,
        can_delete:   (isMine || isModerator) && !isDeleted,
        created_at:   c.created_at,
        updated_at:   c.updated_at,
      };
    });

    return res.json({ data: out, total: out.length });
  } catch (err) {
    return sendInternalError(res, err, "list comments");
  }
};

// ════════════════════════════════════════════════════════════════
// POST /api/writeups/:writeupId/comments
//
// Create a comment. Body is the validated payload — { body }.
// On success, fan out a notification to the writeup author (unless
// the commenter IS the author).
// ════════════════════════════════════════════════════════════════
export const createComment = async (req, res) => {
  try {
    const writeupId = String(req.params.writeupId || "").slice(0, 100);
    if (!writeupId) return res.status(400).json({ error: "writeupId required" });

    const raw = req.body?.body;
    const body = typeof raw === "string" ? raw.trim() : "";
    if (!body) return res.status(400).json({ error: "body required" });
    if (body.length > MAX_BODY) {
      return res.status(400).json({ error: `body capped at ${MAX_BODY} chars` });
    }

    // Confirm the parent writeup exists + is published — we don't want
    // to comment on a soft-deleted writeup, even if the id is valid.
    const { data: parent } = await supabase
      .from("problem_writeups")
      .select("id, user_id, title, problem_id, is_published")
      .eq("id", writeupId)
      .maybeSingle();
    if (!parent || !parent.is_published) {
      return res.status(404).json({ error: "Writeup not found" });
    }

    const { data: created, error } = await supabase
      .from("writeup_comments")
      .insert({
        writeup_id: writeupId,
        author_id:  req.userId,
        body,
      })
      .select()
      .single();
    if (error) throw error;

    // Notify the writeup author — unless the commenter IS the author.
    if (parent.user_id && parent.user_id !== req.userId) {
      try {
        const { data: prob } = await supabase
          .from("problem_statements")
          .select("slug, title")
          .eq("id", parent.problem_id)
          .maybeSingle();
        const commenterName = req.session?.user?.name || "A student";
        sendNotification({
          userIds: [parent.user_id],
          title:   "New comment on your writeup",
          body:    `${commenterName}: "${body.slice(0, 80)}${body.length > 80 ? "…" : ""}"`,
          type:    "info",
          link:    prob?.slug ? `/problems/${prob.slug}` : "/problems",
        }).catch((err) => logger.warn({ err }, "comment notify failed"));
      } catch (err) {
        logger.warn({ err }, "comment notify lookup failed");
      }
    }

    // Resolve author display info so the client doesn't need a
    // second round-trip to render the freshly-posted comment.
    const { data: me } = await supabase
      .from("students")
      .select("name, avatar_url")
      .eq("user_id", req.userId)
      .maybeSingle();

    return res.status(201).json({
      id:           created.id,
      writeup_id:   created.writeup_id,
      author_id:    created.author_id,
      author_name:  me?.name || "You",
      author_avatar: me?.avatar_url || null,
      body:         created.body,
      edited:       false,
      is_deleted:   false,
      is_mine:      true,
      can_edit:     true,
      can_delete:   true,
      created_at:   created.created_at,
      updated_at:   created.updated_at,
    });
  } catch (err) {
    return sendInternalError(res, err, "create comment");
  }
};

// ════════════════════════════════════════════════════════════════
// PATCH /api/writeups/comments/:commentId
//
// Edit own comment. Sets `edited=true` so the UI can render a hint.
// Author-only — moderators don't edit other people's words, they
// soft-delete them.
// ════════════════════════════════════════════════════════════════
export const editComment = async (req, res) => {
  try {
    const commentId = String(req.params.commentId || "").slice(0, 100);
    if (!commentId) return res.status(400).json({ error: "commentId required" });

    const raw = req.body?.body;
    const body = typeof raw === "string" ? raw.trim() : "";
    if (!body) return res.status(400).json({ error: "body required" });
    if (body.length > MAX_BODY) {
      return res.status(400).json({ error: `body capped at ${MAX_BODY} chars` });
    }

    const { data: existing } = await supabase
      .from("writeup_comments")
      .select("id, author_id, body, deleted_at")
      .eq("id", commentId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Comment not found" });
    if (existing.deleted_at) return res.status(410).json({ error: "Comment deleted" });
    if (existing.author_id !== req.userId) {
      return res.status(403).json({ error: "Not your comment" });
    }
    if (existing.body === body) {
      // No-op edit — treat as success without flipping the `edited`
      // flag. Idempotent on accidental double-submit.
      return res.json({ success: true, edited: false });
    }

    const { data: updated, error } = await supabase
      .from("writeup_comments")
      .update({ body, edited: true })
      .eq("id", commentId)
      .select()
      .single();
    if (error) throw error;

    return res.json({
      id:         updated.id,
      body:       updated.body,
      edited:     updated.edited,
      updated_at: updated.updated_at,
    });
  } catch (err) {
    return sendInternalError(res, err, "edit comment");
  }
};

// ════════════════════════════════════════════════════════════════
// DELETE /api/writeups/comments/:commentId
//
// Soft-delete — author, the writeup author (their post, their rules),
// or a moderator. Returns 200 even if already deleted (idempotent).
// ════════════════════════════════════════════════════════════════
export const deleteComment = async (req, res) => {
  try {
    const commentId = String(req.params.commentId || "").slice(0, 100);
    if (!commentId) return res.status(400).json({ error: "commentId required" });

    const { data: existing } = await supabase
      .from("writeup_comments")
      .select("id, author_id, writeup_id, deleted_at")
      .eq("id", commentId)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Comment not found" });
    if (existing.deleted_at) return res.json({ success: true, already: true });

    // Look up the writeup so the writeup-author can also delete.
    const { data: parent } = await supabase
      .from("problem_writeups")
      .select("user_id")
      .eq("id", existing.writeup_id)
      .maybeSingle();

    const isAuthor       = existing.author_id === req.userId;
    const isWriteupOwner = parent?.user_id === req.userId;
    const isModerator    = ["admin", "teacher", "super_admin"].includes(req.userRole);

    if (!isAuthor && !isWriteupOwner && !isModerator) {
      return res.status(403).json({ error: "Cannot delete this comment" });
    }

    const { error } = await supabase
      .from("writeup_comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", commentId);
    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "delete comment");
  }
};
