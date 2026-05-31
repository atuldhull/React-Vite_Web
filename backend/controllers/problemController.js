/**
 * controllers/problemController.js
 *
 * Problem-statement repository (SIH / GSoC / Kaggle / MLH / etc.).
 * Auth-gated READ — any logged-in student sees the full list.
 * Teacher/admin-only WRITE (enforced upstream by requireTeacher).
 *
 * Cross-tenant: this is a PLATFORM catalogue, not per-org content.
 * Direct `supabase` import is intentional — req.db (tenant proxy)
 * would auto-add an org_id filter we don't want here. The migration
 * leaves problem_statements.org_id off entirely.
 */

import axios from "axios";
import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";
import { logger } from "../config/logger.js";
import { sendNotification } from "./notificationController.js";

// Streak milestones we celebrate explicitly. 7 = first week (sticky
// habit), 30 = a month, 100 = serious commitment, 365 = once-a-year
// trophy. Anything else is just a count.
const STREAK_MILESTONES = new Set([7, 14, 30, 50, 100, 200, 365]);

// Cap pagination so a curious client can't ship `limit=10000` and
// pin the DB. 50 is comfortably above the visible-page count at
// every viewport.
const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 24;

// ════════════════════════════════════════════════════════════
// GET /api/problems
//
// Query params:
//   q           — free-text search (matches title + description)
//   domain      — exact match (AI/ML, Govt, Web, Web3, IoT, OpenSource)
//   source      — SIH | GSoC | Kaggle | MLH | Devfolio | Unstop | OpenSource
//   difficulty  — beginner | intermediate | advanced
//   tag         — single tag; can repeat for AND-of-tags
//   page        — 1-based
//   limit       — per page (capped at MAX_PAGE_SIZE)
// ════════════════════════════════════════════════════════════
export const listProblems = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.limit) || DEFAULT_PAGE_SIZE));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabase
      .from("problem_statements")
      .select(
        "id, slug, title, domain, difficulty, organisation, source, source_event, tags, created_at",
        { count: "exact" },
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(from, to);

    // Free-text search across title + description. PostgREST's
    // .or() with .ilike on two cols gives a usable "search bar"
    // without bringing in a fulltext index — fine for the ~1K row
    // scale this table will reach. Upgrade to tsvector if it gets
    // slow (won't until ~50K rows).
    if (req.query.q) {
      const needle = String(req.query.q).trim().slice(0, 100);
      // Escape the comma + parens that .or() treats specially.
      const safe = needle.replace(/[(),]/g, " ");
      if (safe) query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }

    if (req.query.domain)     query = query.eq("domain", String(req.query.domain).slice(0, 40));
    if (req.query.source)     query = query.eq("source", String(req.query.source).slice(0, 40));
    if (req.query.difficulty) query = query.eq("difficulty", String(req.query.difficulty).slice(0, 20));

    // tag filter — supports ?tag=python or ?tag=python&tag=ml.
    // PostgREST's .contains on a text[] column does set-containment.
    if (req.query.tag) {
      const tags = Array.isArray(req.query.tag) ? req.query.tag : [req.query.tag];
      const safeTags = tags.map((t) => String(t).slice(0, 40)).filter(Boolean);
      if (safeTags.length) query = query.contains("tags", safeTags);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({
      data:  data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    return sendInternalError(res, err, "list problems");
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/problems/facets
//
// Distinct values for the filter dropdowns (domain, source).
// Cached at request-handler level only — the table doesn't churn
// enough to justify Redis. Returns:
//   { domains: [...], sources: [...], tags: [...] }
// ════════════════════════════════════════════════════════════
export const getFacets = async (_req, res) => {
  try {
    // PostgREST doesn't have DISTINCT — fetch the columns and
    // dedupe in JS. The table is small enough that this is fine.
    const { data: rows, error } = await supabase
      .from("problem_statements")
      .select("domain, source, tags")
      .eq("is_active", true);
    if (error) throw error;

    const domains = new Set();
    const sources = new Set();
    const tags    = new Set();
    for (const r of rows || []) {
      if (r.domain) domains.add(r.domain);
      if (r.source) sources.add(r.source);
      for (const t of r.tags || []) tags.add(t);
    }

    return res.json({
      domains: [...domains].sort(),
      sources: [...sources].sort(),
      tags:    [...tags].sort(),
    });
  } catch (err) {
    return sendInternalError(res, err, "problem facets");
  }
};

// ════════════════════════════════════════════════════════════
// GET /api/problems/:slugOrId
//
// Detail view. Accepts either the slug (preferred — used in URLs)
// or the UUID. is_active=false rows hidden from this endpoint too;
// a soft-deleted problem stays 404 for students.
// ════════════════════════════════════════════════════════════
export const getProblem = async (req, res) => {
  try {
    const handle = String(req.params.slugOrId || "").slice(0, 100);
    if (!handle) return res.status(400).json({ error: "slug or id required" });

    // Decide which column to query by — UUID has a fixed shape, slug
    // is kebab-case. Avoids the planner having to OR two scans.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
    const col = isUuid ? "id" : "slug";

    const { data, error } = await supabase
      .from("problem_statements")
      .select("id, slug, title, description, how_to_start, domain, difficulty, organisation, source, source_event, official_url, dataset_links, resource_links, tags, created_at, updated_at")
      .eq(col, handle)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Problem statement not found" });

    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "fetch problem");
  }
};

// ════════════════════════════════════════════════════════════
// POST /api/problems  (admin/teacher only — wired upstream)
//
// Body is validated by createProblemSchema. If slug is omitted, it
// gets generated from the title.
// ════════════════════════════════════════════════════════════
export const createProblem = async (req, res) => {
  try {
    const payload = { ...req.body };
    if (!payload.slug) payload.slug = slugify(payload.title);
    payload.created_by = req.session?.user?.id || null;

    const { data, error } = await supabase
      .from("problem_statements")
      .insert(payload)
      .select()
      .single();
    if (error) {
      // Slug collision → 409 (clearer than the generic 500).
      if (error.code === "23505") {
        return res.status(409).json({ error: "A problem with that slug already exists" });
      }
      throw error;
    }
    logger.info({ slug: data.slug, by: req.userId }, "problem created");
    return res.status(201).json(data);
  } catch (err) {
    return sendInternalError(res, err, "create problem");
  }
};

// ════════════════════════════════════════════════════════════
// PATCH /api/problems/:id  (admin/teacher only)
// ════════════════════════════════════════════════════════════
export const updateProblem = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { data, error } = await supabase
      .from("problem_statements")
      .update(req.body)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "PGRST116") return res.status(404).json({ error: "not found" });
      throw error;
    }
    return res.json(data);
  } catch (err) {
    return sendInternalError(res, err, "update problem");
  }
};

// ════════════════════════════════════════════════════════════
// DELETE /api/problems/:id  (admin/teacher only — soft delete)
//
// Sets is_active=false rather than deleting the row. Keeps any
// future "report stats by source" join intact.
// ════════════════════════════════════════════════════════════
export const deleteProblem = async (req, res) => {
  try {
    const id = String(req.params.id || "").slice(0, 100);
    const { error } = await supabase
      .from("problem_statements")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "delete problem");
  }
};

// ════════════════════════════════════════════════════════════
// ENGAGEMENT — interest beacons + writeups
// ════════════════════════════════════════════════════════════
//
// All endpoints below operate on a problem identified by slug or UUID.
// We resolve the slug → id once up front so the engagement rows can
// reference the canonical UUID even when the user lands on a slug URL.

async function resolveProblemId(handleRaw) {
  const handle = String(handleRaw || "").slice(0, 100);
  if (!handle) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
  if (isUuid) return handle;
  const { data } = await supabase
    .from("problem_statements")
    .select("id")
    .eq("slug", handle)
    .eq("is_active", true)
    .maybeSingle();
  return data?.id || null;
}

// ─── GET /api/problems/:slugOrId/engagement ───────────────────
// Returns the interest count, the viewer's own interest flag,
// a small preview avatar list, and the top writeups. One round
// trip from the client so the detail page can render the full
// engagement strip in one fetch.
export const getEngagement = async (req, res) => {
  try {
    const problemId = await resolveProblemId(req.params.slugOrId);
    if (!problemId) return res.status(404).json({ error: "Problem not found" });

    // Interest count + viewer flag.
    const [{ count: interestCount }, { data: myRow }] = await Promise.all([
      supabase.from("problem_interests").select("user_id", { count: "exact", head: true }).eq("problem_id", problemId),
      supabase.from("problem_interests").select("user_id").eq("problem_id", problemId).eq("user_id", req.userId).maybeSingle(),
    ]);

    // Top 5 most-recent interested users — for the avatar strip.
    const { data: recent } = await supabase
      .from("problem_interests")
      .select("user_id, created_at")
      .eq("problem_id", problemId)
      .order("created_at", { ascending: false })
      .limit(5);

    let interestedUsers = [];
    if (recent && recent.length) {
      const userIds = recent.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("students")
        .select("user_id, name, avatar_url")
        .in("user_id", userIds);
      const byId = new Map((profiles || []).map((p) => [p.user_id, p]));
      interestedUsers = recent.map((r) => ({
        user_id:    r.user_id,
        name:       byId.get(r.user_id)?.name || "Anonymous",
        avatar_url: byId.get(r.user_id)?.avatar_url || null,
      }));
    }

    // Top writeups — vote_count desc, then recency. We render the
    // body inside the panel so 16KB cap is fine to ship inline.
    const { data: writeups } = await supabase
      .from("problem_writeups")
      .select("id, user_id, title, body, repo_url, vote_count, created_at")
      .eq("problem_id", problemId)
      .eq("is_published", true)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    let writeupRows = [];
    if (writeups && writeups.length) {
      const userIds = [...new Set(writeups.map((w) => w.user_id))];
      const { data: profiles } = await supabase
        .from("students")
        .select("user_id, name, avatar_url")
        .in("user_id", userIds);
      const byId = new Map((profiles || []).map((p) => [p.user_id, p]));

      // Which writeups has the viewer upvoted?
      const ids = writeups.map((w) => w.id);
      const { data: myVotes } = await supabase
        .from("writeup_votes")
        .select("writeup_id")
        .in("writeup_id", ids)
        .eq("user_id", req.userId);
      const votedSet = new Set((myVotes || []).map((v) => v.writeup_id));

      writeupRows = writeups.map((w) => ({
        ...w,
        author_name:   byId.get(w.user_id)?.name || "Anonymous",
        author_avatar: byId.get(w.user_id)?.avatar_url || null,
        voted_by_me:   votedSet.has(w.id),
        is_mine:       w.user_id === req.userId,
      }));
    }

    return res.json({
      problem_id:       problemId,
      interest_count:   interestCount || 0,
      i_am_interested:  Boolean(myRow),
      interested_users: interestedUsers,
      writeups:         writeupRows,
    });
  } catch (err) {
    return sendInternalError(res, err, "fetch problem engagement");
  }
};

// ─── POST /api/problems/:slugOrId/interest ───────────────────
// Toggles the viewer's interest beacon on this problem. Idempotent:
// re-clicking removes it.
export const toggleInterest = async (req, res) => {
  try {
    const problemId = await resolveProblemId(req.params.slugOrId);
    if (!problemId) return res.status(404).json({ error: "Problem not found" });

    // Is the row already present? Cheaper than a try/catch on a
    // unique-violation insert because we want a *toggle*, not retry.
    const { data: existing } = await supabase
      .from("problem_interests")
      .select("user_id")
      .eq("problem_id", problemId)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("problem_interests")
        .delete()
        .eq("problem_id", problemId)
        .eq("user_id", req.userId);
      if (error) throw error;
      return res.json({ i_am_interested: false });
    }

    const { error } = await supabase
      .from("problem_interests")
      .insert({ problem_id: problemId, user_id: req.userId });
    if (error && error.code !== "23505") throw error; // double-click race → ignore
    return res.json({ i_am_interested: true });
  } catch (err) {
    return sendInternalError(res, err, "toggle problem interest");
  }
};

// ─── POST /api/problems/:slugOrId/writeups ───────────────────
// Create or update the viewer's writeup. One per (problem, user) —
// the UNIQUE constraint means a re-submit overwrites. We do that
// explicitly with upsert(onConflict) so the DB does the right thing
// regardless of whether the client already has a draft id.
export const upsertWriteup = async (req, res) => {
  try {
    const problemId = await resolveProblemId(req.params.slugOrId);
    if (!problemId) return res.status(404).json({ error: "Problem not found" });

    const { title, body, repo_url } = req.body || {};
    if (!title || !title.trim())  return res.status(400).json({ error: "title required" });
    if (!body  || !body.trim())   return res.status(400).json({ error: "body required" });

    const payload = {
      problem_id:   problemId,
      user_id:      req.userId,
      title:        String(title).trim().slice(0, 200),
      body:         String(body).trim().slice(0, 16000),
      repo_url:     repo_url ? String(repo_url).trim().slice(0, 500) : null,
      is_published: true,
    };

    // Was this an INSERT or an UPDATE? If a row already exists for
    // (problem_id, user_id) the upsert is an update — don't spam
    // interested users about an edit. We peek first so we can tell.
    const { data: previously } = await supabase
      .from("problem_writeups")
      .select("id")
      .eq("problem_id", problemId)
      .eq("user_id", req.userId)
      .maybeSingle();
    const isNew = !previously;

    const { data, error } = await supabase
      .from("problem_writeups")
      .upsert(payload, { onConflict: "problem_id,user_id" })
      .select()
      .single();
    if (error) throw error;

    // Fan out a notification to everyone who marked interest on this
    // problem (except the writeup author themselves). This is the
    // moment the catalogue feels alive — "Hey, someone else just
    // shared how they solved the thing you're working on."
    if (isNew) {
      try {
        const { data: interested } = await supabase
          .from("problem_interests")
          .select("user_id")
          .eq("problem_id", problemId)
          .neq("user_id", req.userId);
        const recipients = (interested || []).map((r) => r.user_id);
        if (recipients.length) {
          const { data: prob } = await supabase
            .from("problem_statements")
            .select("slug, title")
            .eq("id", problemId)
            .maybeSingle();
          const authorName = req.session?.user?.name || "A student";
          sendNotification({
            userIds: recipients,
            title:   "New writeup on a problem you're tackling",
            body:    `${authorName} posted "${data.title.slice(0, 60)}" on ${(prob?.title || "the problem").slice(0, 60)}`,
            type:    "info",
            link:    prob?.slug ? `/problems/${prob.slug}` : "/problems",
          }).catch((err) => logger.warn({ err }, "new-writeup notify failed"));
        }
      } catch (err) {
        // Non-fatal — the writeup itself is already saved.
        logger.warn({ err }, "interested-users fan-out lookup failed");
      }
    }

    return res.status(201).json(data);
  } catch (err) {
    return sendInternalError(res, err, "upsert writeup");
  }
};

// ─── DELETE /api/problems/:slugOrId/writeups/:writeupId ──────
// Soft-deletes the viewer's own writeup (is_published=false). Admin /
// teacher can hard-delete via DELETE on the catalogue; for student
// self-service we just hide.
export const deleteWriteup = async (req, res) => {
  try {
    const writeupId = String(req.params.writeupId || "").slice(0, 100);
    // Lookup author so a malicious client can't delete someone else's
    // writeup by guessing the id (UUID brute is ~impossible, but
    // belt-and-braces).
    const { data: row } = await supabase
      .from("problem_writeups")
      .select("user_id")
      .eq("id", writeupId)
      .maybeSingle();
    if (!row) return res.status(404).json({ error: "Writeup not found" });

    const isAuthor    = row.user_id === req.userId;
    const isModerator = ["admin", "teacher", "super_admin"].includes(req.userRole);
    if (!isAuthor && !isModerator) {
      return res.status(403).json({ error: "Not your writeup" });
    }

    const { error } = await supabase
      .from("problem_writeups")
      .update({ is_published: false })
      .eq("id", writeupId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "delete writeup");
  }
};

// ─── POST /api/problems/writeups/:writeupId/vote ─────────────
// Toggle upvote. The DB trigger keeps problem_writeups.vote_count in
// sync; we return the fresh count so the client can update without a
// re-fetch of the whole engagement payload.
export const toggleWriteupVote = async (req, res) => {
  try {
    const writeupId = String(req.params.writeupId || "").slice(0, 100);

    const { data: existing } = await supabase
      .from("writeup_votes")
      .select("writeup_id")
      .eq("writeup_id", writeupId)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("writeup_votes")
        .delete()
        .eq("writeup_id", writeupId)
        .eq("user_id", req.userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("writeup_votes")
        .insert({ writeup_id: writeupId, user_id: req.userId });
      if (error && error.code !== "23505") throw error;
    }

    const { data: fresh } = await supabase
      .from("problem_writeups")
      .select("vote_count, user_id, title, problem_id")
      .eq("id", writeupId)
      .maybeSingle();

    // Notify the author on a fresh UPVOTE (not on un-vote, not on
    // self-vote). Fire-and-forget; failures here are non-fatal —
    // the vote already landed.
    if (!existing && fresh && fresh.user_id && fresh.user_id !== req.userId) {
      const { data: problem } = await supabase
        .from("problem_statements")
        .select("slug")
        .eq("id", fresh.problem_id)
        .maybeSingle();
      const voterName = req.session?.user?.name || "Someone";
      sendNotification({
        userIds: [fresh.user_id],
        title:   "Your writeup got an upvote",
        body:    `${voterName} upvoted "${(fresh.title || "your writeup").slice(0, 60)}"`,
        type:    "info",
        link:    problem?.slug ? `/problems/${problem.slug}` : "/problems",
      }).catch((err) => logger.warn({ err }, "writeup-vote notify failed"));
    }

    return res.json({
      voted_by_me: !existing,
      vote_count:  fresh?.vote_count ?? 0,
    });
  } catch (err) {
    return sendInternalError(res, err, "toggle writeup vote");
  }
};

// ════════════════════════════════════════════════════════════
// AI STUDY COMPANION
// ════════════════════════════════════════════════════════════
//
// POST /api/problems/:slugOrId/ai-ask
//
// Scoped Socratic assistant: the problem's title + description +
// how_to_start are injected into the system prompt so the model has
// the problem on hand without the client having to ship it. The model
// is asked to give HINTS not solutions — this is study support, not
// homework-completion.
//
// Auth: requireAuth upstream. Rate-limit: aiLimiter (20/hr/user)
// applied at the route layer (shared budget with /comments/ask-ai and
// /bot/chat so a single student can't drain the OpenRouter spend by
// jumping between surfaces).
export const askProblemAi = async (req, res) => {
  try {
    const problemId = await resolveProblemId(req.params.slugOrId);
    if (!problemId) return res.status(404).json({ error: "Problem not found" });

    const { question } = req.body || {};
    const q = String(question || "").trim();
    if (!q)              return res.status(400).json({ error: "question required" });
    if (q.length > 2000) return res.status(400).json({ error: "question too long (max 2000 chars)" });

    // Fetch just the fields we feed into the prompt. Keep the
    // description trimmed — long SIH writeups are 4-6KB which would
    // burn tokens on every call.
    const { data: problem, error } = await supabase
      .from("problem_statements")
      .select("title, description, how_to_start, domain, source")
      .eq("id", problemId)
      .maybeSingle();
    if (error) throw error;
    if (!problem) return res.status(404).json({ error: "Problem not found" });

    const description  = String(problem.description  || "").slice(0, 2000);
    const howToStart   = String(problem.how_to_start || "").slice(0, 1500);

    const system =
      `You are a study companion helping a student tackle the following ${problem.source || "open-source"} problem.\n\n` +
      `TITLE: ${problem.title}\n` +
      `DOMAIN: ${problem.domain}\n\n` +
      `DESCRIPTION:\n${description}\n\n` +
      (howToStart ? `HOW TO START (canonical guidance for this problem):\n${howToStart}\n\n` : "") +
      `Rules:\n` +
      `- Be Socratic — guide the student to the answer with hints, leading questions, and pointers. NEVER hand over a complete solution.\n` +
      `- Cite specific parts of the problem when you reference them.\n` +
      `- If the student asks for code, give a small targeted snippet (≤ 15 lines) plus an explanation, not a full solution.\n` +
      `- If the question is off-topic for THIS problem, say so briefly and steer back.\n` +
      `- Keep responses under 280 words. Use plain text, no markdown headers.`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      logger.warn("askProblemAi called but OPENROUTER_API_KEY is unset");
      return res.status(503).json({ error: "AI study companion is not configured. Try again later." });
    }

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model:    "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: system },
          { role: "user",   content: q },
        ],
        temperature: 0.6,
        max_tokens:  500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":  "https://mathcollective.bmsit.in",
          "X-Title":       "Math Collective — Problem Companion",
        },
        timeout: 30000,
      },
    );

    const reply = response.data?.choices?.[0]?.message?.content?.trim()
      || "Couldn't get a response. Try rephrasing your question.";

    return res.json({ reply });
  } catch (err) {
    // axios timeouts and OpenRouter 5xx land here. Don't leak the
    // OpenRouter stack to the client — generic 502.
    if (err?.response?.status) {
      logger.warn({ status: err.response.status, data: err.response.data }, "OpenRouter upstream error");
      return res.status(502).json({ error: "AI is unavailable right now. Try again in a minute." });
    }
    return sendInternalError(res, err, "problem ai-ask");
  }
};

// ════════════════════════════════════════════════════════════
// DAILY PROBLEM OF THE DAY
// ════════════════════════════════════════════════════════════
//
// GET /api/problems/daily
//
// Returns today's pick + the viewer's streak info in one trip. If
// daily_picks has no row for today, we lazily insert one (random
// active problem) — no cron needed. Race-safe via ON CONFLICT.
//
// POST /api/problems/daily/checkin
//
// Marks the viewer as having engaged with today's problem. Bumps the
// streak if yesterday was also checked in; resets to 1 otherwise.
// Idempotent — re-calling on the same day is a no-op.

// Today in the server's local TZ. The pick is global, so we pick a
// single TZ — UTC is the obvious choice and lets us avoid any
// "different timezones see different daily problems" confusion.
function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function yesterdayUtc() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── GET /api/problems/daily ──────────────────────────────────
export const getDailyProblem = async (req, res) => {
  try {
    const today = todayUtc();

    // 1. Is today's pick already chosen?
    let pickRow;
    {
      const { data, error } = await supabase
        .from("daily_picks")
        .select("pick_date, problem_id")
        .eq("pick_date", today)
        .maybeSingle();
      if (error) throw error;
      pickRow = data;
    }

    // 2. If not, choose one and insert (race-safe).
    if (!pickRow) {
      // Pull a random active problem. PostgREST doesn't have
      // ORDER BY random(), so we fetch ids and sample in JS. With
      // ~365 rows this is a 4KB read — fine.
      const { data: ids, error: idsErr } = await supabase
        .from("problem_statements")
        .select("id")
        .eq("is_active", true);
      if (idsErr) throw idsErr;
      if (!ids || ids.length === 0) {
        return res.status(503).json({ error: "No active problems to pick from yet." });
      }
      const choice = ids[Math.floor(Math.random() * ids.length)];

      // Insert. ON CONFLICT (pick_date) DO NOTHING via upsert. If two
      // first requests race, both supply different problem_ids but
      // only the first INSERT wins; we then read the winning row back.
      await supabase
        .from("daily_picks")
        .upsert({ pick_date: today, problem_id: choice.id }, { onConflict: "pick_date", ignoreDuplicates: true });

      const { data: stored, error: re } = await supabase
        .from("daily_picks")
        .select("pick_date, problem_id")
        .eq("pick_date", today)
        .maybeSingle();
      if (re) throw re;
      pickRow = stored;
    }

    // 3. Fetch the problem metadata (slim — list-card shape).
    const { data: problem, error: pErr } = await supabase
      .from("problem_statements")
      .select("id, slug, title, domain, difficulty, organisation, source, source_event, tags")
      .eq("id", pickRow.problem_id)
      .maybeSingle();
    if (pErr) throw pErr;

    // 4. The viewer's streak.
    const { data: stu } = await supabase
      .from("students")
      .select("streak_days, streak_last_date")
      .eq("user_id", req.userId)
      .maybeSingle();

    const checkedInToday = stu?.streak_last_date === today;

    return res.json({
      date:               today,
      problem,
      streak_days:        stu?.streak_days || 0,
      streak_last_date:   stu?.streak_last_date || null,
      checked_in_today:   checkedInToday,
    });
  } catch (err) {
    return sendInternalError(res, err, "fetch daily problem");
  }
};

// ─── POST /api/problems/daily/checkin ─────────────────────────
export const dailyCheckin = async (req, res) => {
  try {
    const today = todayUtc();
    const yest  = yesterdayUtc();

    const { data: stu, error } = await supabase
      .from("students")
      .select("streak_days, streak_last_date")
      .eq("user_id", req.userId)
      .maybeSingle();
    if (error) throw error;
    if (!stu) return res.status(404).json({ error: "Student record not found" });

    // Already done today → idempotent no-op.
    if (stu.streak_last_date === today) {
      return res.json({
        streak_days:      stu.streak_days,
        streak_last_date: stu.streak_last_date,
        already_today:    true,
      });
    }

    // Continue or reset the streak.
    const newDays = stu.streak_last_date === yest ? (stu.streak_days || 0) + 1 : 1;

    const { error: uErr } = await supabase
      .from("students")
      .update({ streak_days: newDays, streak_last_date: today })
      .eq("user_id", req.userId);
    if (uErr) throw uErr;

    // Milestone? Self-notify so the bell + service-worker push fire.
    if (STREAK_MILESTONES.has(newDays)) {
      sendNotification({
        userIds: [req.userId],
        title:   `${newDays}-day streak 🔥`,
        body:    newDays === 365
          ? "A full year of daily check-ins. Truly legendary."
          : `Daily streak at ${newDays} days. Keep going — momentum is the whole game.`,
        type:    "achievement",
        link:    "/dashboard",
      }).catch((err) => logger.warn({ err }, "streak-milestone notify failed"));
    }

    return res.json({
      streak_days:      newDays,
      streak_last_date: today,
      already_today:    false,
    });
  } catch (err) {
    return sendInternalError(res, err, "daily checkin");
  }
};

// ════════════════════════════════════════════════════════════
// helpers
// ════════════════════════════════════════════════════════════
function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")                       // strip accents
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
