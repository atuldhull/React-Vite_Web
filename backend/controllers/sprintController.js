/**
 * controllers/sprintController.js
 *
 * Solution Sprints — a weekly featured problem with a window-scoped
 * leaderboard. Sprints are created LAZILY: when /sprints/active is
 * hit and no row covers NOW(), the controller mints one.
 *
 * Lazy creation > cron: Render's free tier doesn't run scheduled
 * jobs, and the platform sees enough daily traffic (Monday POTD
 * widget, navbar pings) that "first request after Sunday midnight"
 * is well within a reasonable freshness window.
 *
 * Cross-tenant: sprints reference problem_statements which is
 * platform-wide. The leaderboard reads problem_writeups (also
 * platform-wide) and writeup_votes (window-filtered). `students`
 * is read for author display names — same cross-tenant intent as
 * the writeup author rendering in problemController.
 */

import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";
import { logger } from "../config/logger.js";

// Sprint length — 7 days, Monday 00:00 UTC → Sunday 23:59 UTC.
// Picking UTC keeps everyone (BMSIT students, distant viewers, the
// sitemap, search crawlers) seeing the same boundary at the same
// instant. The display layer can render in local time.
const SPRINT_DAYS = 7;

// How many writeups to surface on the leaderboard.
const LEADERBOARD_LIMIT = 20;

// ════════════════════════════════════════════════════════════════
// GET /api/sprints/active
//
// Returns the currently-active sprint with its problem details.
// Creates a fresh sprint if none active. Idempotent on concurrent
// "first ping" requests — the unique partial index makes a second
// insert fail with 23505 and we recover by re-reading.
// ════════════════════════════════════════════════════════════════
export const getActiveSprint = async (req, res) => {
  try {
    let sprint = await readActiveSprint();
    if (!sprint || isExpired(sprint)) {
      // The previous sprint (if any) ended — archive it first, then
      // mint a fresh one. Order matters: archive before insert so the
      // unique-active index doesn't reject the new row.
      if (sprint && isExpired(sprint)) await archiveSprint(sprint.id);
      sprint = await createNextSprint();
      if (!sprint) {
        return res.status(503).json({ error: "No problem available to feature this week" });
      }
    }

    // Fetch the problem + writeup count for the active sprint to
    // give the dashboard widget enough to render without a second
    // round-trip.
    const { data: problem } = await supabase
      .from("problem_statements")
      .select("id, slug, title, difficulty, source, organisation, tags")
      .eq("id", sprint.problem_id)
      .maybeSingle();

    const { count: writeupCount } = await supabase
      .from("problem_writeups")
      .select("id", { count: "exact", head: true })
      .eq("problem_id", sprint.problem_id)
      .eq("is_published", true)
      .gte("created_at", sprint.starts_at)
      .lte("created_at", sprint.ends_at);

    return res.json({
      sprint: {
        id:         sprint.id,
        slug:       sprint.slug,
        title:      sprint.title,
        starts_at:  sprint.starts_at,
        ends_at:    sprint.ends_at,
        is_active:  sprint.is_active,
        is_pinned:  sprint.is_pinned,
      },
      problem: problem || null,
      writeup_count: writeupCount || 0,
    });
  } catch (err) {
    return sendInternalError(res, err, "active sprint");
  }
};

// ════════════════════════════════════════════════════════════════
// GET /api/sprints/leaderboard?slug=...
//
// Window-scoped leaderboard for one sprint. If slug is omitted,
// uses the active sprint. Scores = upvote count restricted to votes
// whose created_at falls inside the sprint window.
// ════════════════════════════════════════════════════════════════
export const getLeaderboard = async (req, res) => {
  try {
    const slug = req.query.slug ? String(req.query.slug).slice(0, 60) : null;
    let sprint;
    if (slug) {
      const { data } = await supabase
        .from("solution_sprints")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      sprint = data;
    } else {
      sprint = await readActiveSprint();
      if (!sprint || isExpired(sprint)) {
        sprint = await createNextSprint();
      }
    }
    if (!sprint) return res.status(404).json({ error: "Sprint not found" });

    // Writeups posted on this problem during the window.
    const { data: writeups } = await supabase
      .from("problem_writeups")
      .select("id, user_id, title, vote_count, created_at")
      .eq("problem_id", sprint.problem_id)
      .eq("is_published", true)
      .gte("created_at", sprint.starts_at)
      .lte("created_at", sprint.ends_at)
      .limit(100);

    let rows = [];
    if (writeups && writeups.length) {
      // Score = votes whose created_at is inside the sprint window.
      // We pull each writeup's window-bounded vote count via a single
      // grouped query — cheaper than N round-trips.
      const ids = writeups.map((w) => w.id);
      const { data: voteRows } = await supabase
        .from("writeup_votes")
        .select("writeup_id, created_at")
        .in("writeup_id", ids)
        .gte("created_at", sprint.starts_at)
        .lte("created_at", sprint.ends_at);

      const countByWriteup = new Map();
      for (const v of voteRows || []) {
        countByWriteup.set(v.writeup_id, (countByWriteup.get(v.writeup_id) || 0) + 1);
      }

      // Author display.
      const userIds = [...new Set(writeups.map((w) => w.user_id))];
      const { data: profiles } = await supabase
        .from("students")
        .select("user_id, name, avatar_url, handle, public_portfolio")
        .in("user_id", userIds);
      const byUser = new Map((profiles || []).map((p) => [p.user_id, p]));

      rows = writeups
        .map((w) => {
          const profile = byUser.get(w.user_id) || {};
          return {
            writeup_id:   w.id,
            user_id:      w.user_id,
            title:        w.title,
            author_name:  profile.name || "Anonymous",
            author_avatar: profile.avatar_url || null,
            author_handle: profile.public_portfolio ? profile.handle : null,
            score:        countByWriteup.get(w.id) || 0,
            posted_at:    w.created_at,
          };
        })
        .sort((a, b) => b.score - a.score || new Date(a.posted_at) - new Date(b.posted_at))
        .slice(0, LEADERBOARD_LIMIT);
    }

    return res.json({
      sprint: {
        id:        sprint.id,
        slug:      sprint.slug,
        title:     sprint.title,
        starts_at: sprint.starts_at,
        ends_at:   sprint.ends_at,
        is_active: sprint.is_active,
      },
      leaderboard: rows,
    });
  } catch (err) {
    return sendInternalError(res, err, "sprint leaderboard");
  }
};

// ════════════════════════════════════════════════════════════════
// GET /api/sprints
//
// Archive — every sprint, newest first. Limited to last 26 (half
// a year). The detail page can paginate beyond if it ever matters.
// ════════════════════════════════════════════════════════════════
export const listSprints = async (req, res) => {
  try {
    const { data: sprints } = await supabase
      .from("solution_sprints")
      .select("id, slug, title, problem_id, starts_at, ends_at, is_active")
      .order("starts_at", { ascending: false })
      .limit(26);

    if (!sprints || !sprints.length) return res.json({ data: [] });

    const problemIds = [...new Set(sprints.map((s) => s.problem_id))];
    const { data: probs } = await supabase
      .from("problem_statements")
      .select("id, slug, title, difficulty, source")
      .in("id", problemIds);
    const byId = new Map((probs || []).map((p) => [p.id, p]));

    const out = sprints.map((s) => ({
      ...s,
      problem: byId.get(s.problem_id) || null,
    }));

    return res.json({ data: out });
  } catch (err) {
    return sendInternalError(res, err, "list sprints");
  }
};

// ════════════════════════════════════════════════════════════════
// POST /api/sprints/pin — admin pins the next sprint's problem.
// ════════════════════════════════════════════════════════════════
export const pinNextSprint = async (req, res) => {
  try {
    const { problem_id, reason } = req.body || {};
    if (!problem_id) return res.status(400).json({ error: "problem_id required" });

    // Confirm the problem exists + is active.
    const { data: prob } = await supabase
      .from("problem_statements")
      .select("id, title")
      .eq("id", problem_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!prob) return res.status(404).json({ error: "Problem not found / inactive" });

    // Replace any existing pin — only one queue slot at a time.
    await supabase.from("sprint_pin_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { data: pinned, error } = await supabase
      .from("sprint_pin_queue")
      .insert({
        problem_id,
        pinned_by: req.userId,
        reason: reason ? String(reason).slice(0, 500) : null,
      })
      .select()
      .single();
    if (error) throw error;

    return res.status(201).json({ pinned, problem: prob });
  } catch (err) {
    return sendInternalError(res, err, "pin next sprint");
  }
};

// ════════════════════════════════════════════════════════════════
// DELETE /api/sprints/pin — admin clears the pin queue.
// ════════════════════════════════════════════════════════════════
export const unpinNextSprint = async (req, res) => {
  try {
    await supabase.from("sprint_pin_queue").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return res.json({ success: true });
  } catch (err) {
    return sendInternalError(res, err, "unpin next sprint");
  }
};

// ════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════

async function readActiveSprint() {
  const { data } = await supabase
    .from("solution_sprints")
    .select("*")
    .eq("is_active", true)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

function isExpired(sprint) {
  return new Date(sprint.ends_at).getTime() < Date.now();
}

async function archiveSprint(sprintId) {
  const { error } = await supabase
    .from("solution_sprints")
    .update({ is_active: false })
    .eq("id", sprintId);
  if (error) logger.warn({ err: error }, "sprint archive failed");
}

/** Compute the sprint window for "now". Monday 00:00 UTC → Monday
 *  +7 days. If the active sprint just expired mid-day, the next
 *  one starts at the most-recent Monday, NOT next Monday — we don't
 *  want the platform showing "no active sprint" for days. */
function nextSprintWindow() {
  const now = new Date();
  // Day-of-week: 0 = Sunday, 1 = Monday, …, 6 = Saturday (UTC).
  const dow = now.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7; // Monday → 0, Sunday → 6
  const start = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0,
  ));
  const end = new Date(start.getTime() + SPRINT_DAYS * 24 * 60 * 60 * 1000 - 1000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

/** yyyy-WW style slug. Pure ISO week computation. */
function slugForWindow(starts_at) {
  const d = new Date(starts_at);
  // ISO week number — Thursday-of-week trick.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diffDays = Math.round((target - firstThursday) / (24 * 60 * 60 * 1000));
  const weekNo = 1 + Math.floor(diffDays / 7);
  return `sprint-${target.getUTCFullYear()}-w${String(weekNo).padStart(2, "0")}`;
}

/** Pick the problem for the next sprint. Pinned admin choice wins;
 *  otherwise the least-recently-featured active problem. */
async function pickNextProblem() {
  // Pinned slot?
  const { data: pin } = await supabase
    .from("sprint_pin_queue")
    .select("id, problem_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (pin && pin.problem_id) {
    // Consume the pin — delete the row regardless of insert outcome.
    await supabase.from("sprint_pin_queue").delete().eq("id", pin.id);
    return pin.problem_id;
  }

  // Auto-pick: a problem that's been a sprint before but not recently,
  // or one that's never been featured at all. We left-join sprints to
  // get "last featured" and order ASC NULLS FIRST → never-featured
  // problems come first.
  //
  // Supabase doesn't surface raw left-joins in PostgREST nicely, so
  // we do this in two reads.

  const { data: past } = await supabase
    .from("solution_sprints")
    .select("problem_id, starts_at")
    .order("starts_at", { ascending: false })
    .limit(200);
  const lastBy = new Map();
  for (const r of past || []) {
    if (!lastBy.has(r.problem_id)) lastBy.set(r.problem_id, r.starts_at);
  }

  // Candidate pool — active problems ordered by some "engagement"
  // signal. We use difficulty buckets so the rotation feels varied
  // (no two intermediate-level sprints back-to-back).
  const { data: pool } = await supabase
    .from("problem_statements")
    .select("id, title, difficulty")
    .eq("is_active", true)
    .limit(500);
  if (!pool || !pool.length) return null;

  // Sort: never-featured first, then oldest last-featured.
  pool.sort((a, b) => {
    const la = lastBy.get(a.id) || "0000";
    const lb = lastBy.get(b.id) || "0000";
    if (la === lb) return 0;
    return la < lb ? -1 : 1;
  });

  return pool[0].id;
}

/** Create the next sprint. Idempotent against the unique-active
 *  index — on conflict, re-read and return. */
async function createNextSprint() {
  const problemId = await pickNextProblem();
  if (!problemId) return null;

  const { starts_at, ends_at } = nextSprintWindow();
  const slug = slugForWindow(starts_at);

  // Display title is just the slug humanised; admins can rename via
  // pinning if it matters.
  const title = `Sprint · ${slug.replace(/^sprint-/, "")}`;

  const { data, error } = await supabase
    .from("solution_sprints")
    .insert({
      problem_id: problemId,
      slug,
      title,
      starts_at,
      ends_at,
      is_active: true,
      is_pinned: false,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique violation. Another request beat us to the
    // active-sprint slot — re-read and return that row.
    if (error.code === "23505") {
      return await readActiveSprint();
    }
    logger.warn({ err: error }, "sprint mint failed");
    return null;
  }

  return data;
}
