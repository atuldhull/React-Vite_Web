/**
 * controllers/portfolioController.js
 *
 * Public, UNAUTHENTICATED portfolio pages — /u/:handle on the
 * frontend, /api/portfolio/:handle on the backend. Distinct from
 * the existing rich in-org profile (/api/users/:id/profile) because:
 *
 *   - This endpoint is internet-public. No session required.
 *   - Default state is OPT-OUT (students.public_portfolio = false).
 *     A 404 is returned for any handle whose owner hasn't opted in.
 *   - It deliberately aggregates a smaller, share-friendly slice:
 *     headline + bio + writeups + projects + achievements + certs.
 *     Activity feed (clickstream) is intentionally excluded — what
 *     a student wants to put on LinkedIn isn't the same as what
 *     classmates see internally.
 *
 * The aggregation runs as one server-side join through targeted
 * Supabase reads; clients get a single payload and don't fan out.
 */

import supabase from "../config/supabase.js";
import { sendInternalError } from "../lib/errorResponse.js";

// ────────────────────────────────────────────────────────────
// GET /api/portfolio/:handle    [PUBLIC — no auth]
// ────────────────────────────────────────────────────────────
export const getPublicPortfolio = async (req, res) => {
  try {
    const handle = String(req.params.handle || "").trim().toLowerCase().slice(0, 80);
    if (!handle || !/^[a-z0-9-]+$/.test(handle)) {
      return res.status(404).json({ error: "Portfolio not found" });
    }

    // 1. Find the student. Return 404 — and the SAME shape — for any
    //    of: unknown handle, opted-out, suspended. Don't leak which.
    const { data: student, error } = await supabase
      .from("students")
      .select("user_id, name, handle, avatar_emoji, avatar_color, bio, title, xp, role, is_active, created_at, public_portfolio, portfolio_headline, portfolio_socials, streak_days")
      .eq("handle", handle)
      .maybeSingle();
    if (error) throw error;
    if (!student || !student.public_portfolio || student.is_active === false) {
      return res.status(404).json({ error: "Portfolio not found" });
    }

    const userId = student.user_id;

    // 2. Resolve the user's teams once so we can join projects
    //    through team_id (the projects table is keyed by team, not by
    //    user — see migration 06).
    const { data: ownedTeams } = await supabase
      .from("teams")
      .select("id")
      .eq("leader_id", userId);
    const teamIds = (ownedTeams || []).map((t) => t.id);

    // 3. Fan out the aggregation reads in parallel.
    const [writeupsRes, projectsRes, achievementsRes, certsRes, roadmapsRes] = await Promise.all([
      // Writeups — published only, ordered by votes.
      supabase
        .from("problem_writeups")
        .select("id, title, body, repo_url, vote_count, created_at, problem_id")
        .eq("user_id", userId)
        .eq("is_published", true)
        .order("vote_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      // Projects — approved-and-belongs-to-user's-team. If the
      // student isn't a team leader on anything, this returns [].
      teamIds.length
        ? supabase
            .from("projects")
            .select("id, title, description, github_url, demo_url, category, created_at")
            .in("team_id", teamIds)
            .eq("is_approved", true)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
      // Achievements unlocked by the user. Joined to the
      // `achievements` lookup for title/description/icon/rarity.
      supabase
        .from("user_achievements")
        .select("achievement_id, unlocked_at, achievements (id, title, description, icon, rarity)")
        .eq("user_id", userId)
        .order("unlocked_at", { ascending: false })
        .limit(40),
      // Certificates issued to the user. event_name is the closest
      // thing to a title on this schema.
      supabase
        .from("certificates")
        .select("id, event_name, recipient_name, issued_at")
        .eq("user_id", userId)
        .order("issued_at", { ascending: false })
        .limit(20),
      // Completed roadmaps — count(distinct roadmap_id) per the
      // progress table. Roadmaps with 100% step completion.
      supabase
        .from("roadmap_progress")
        .select("roadmap_id, step_id, roadmaps (id, slug, title, cover_emoji)")
        .eq("user_id", userId),
    ]);

    // 3. Enrich writeups with the linked problem title.
    let writeupRows = [];
    if (writeupsRes.data && writeupsRes.data.length) {
      const problemIds = [...new Set(writeupsRes.data.map((w) => w.problem_id).filter(Boolean))];
      let probsById = new Map();
      if (problemIds.length) {
        const { data: probs } = await supabase
          .from("problem_statements")
          .select("id, slug, title, source")
          .in("id", problemIds);
        probsById = new Map((probs || []).map((p) => [p.id, p]));
      }
      writeupRows = writeupsRes.data.map((w) => ({
        ...w,
        problem: probsById.get(w.problem_id) || null,
      }));
    }

    // 4. Roll up roadmap progress into completed roadmaps.
    //    A roadmap is "completed" when the user has progress rows for
    //    every step in it. We need step counts per roadmap — one
    //    aggregation query.
    let completedRoadmaps = [];
    if (roadmapsRes.data && roadmapsRes.data.length) {
      const byMap = new Map(); // roadmap_id → { meta, doneSteps }
      for (const row of roadmapsRes.data) {
        if (!row.roadmaps) continue;
        const entry = byMap.get(row.roadmap_id) || { meta: row.roadmaps, doneSteps: 0 };
        entry.doneSteps += 1;
        byMap.set(row.roadmap_id, entry);
      }
      const roadmapIds = [...byMap.keys()];
      if (roadmapIds.length) {
        const { data: stepCounts } = await supabase
          .from("roadmap_steps")
          .select("roadmap_id")
          .in("roadmap_id", roadmapIds);
        const totalsByRoadmap = new Map();
        for (const s of stepCounts || []) {
          totalsByRoadmap.set(s.roadmap_id, (totalsByRoadmap.get(s.roadmap_id) || 0) + 1);
        }
        for (const [rid, entry] of byMap) {
          const total = totalsByRoadmap.get(rid) || 0;
          if (total > 0 && entry.doneSteps >= total) {
            completedRoadmaps.push(entry.meta);
          }
        }
      }
    }

    // 5. Strip noisy fields before serialising. user_id is included
    //    so the optional "Send me a message" CTA can link into the
    //    in-org chat once the viewer logs in — but we never expose
    //    email or org_id on the public surface.
    return res.json({
      handle:      student.handle,
      name:        student.name,
      title:       student.title,
      headline:    student.portfolio_headline || null,
      bio:         student.bio || null,
      socials:     student.portfolio_socials || {},
      avatar:      {
        emoji: student.avatar_emoji,
        color: student.avatar_color,
      },
      stats: {
        xp:          student.xp || 0,
        streak_days: student.streak_days || 0,
        joined:      student.created_at,
      },
      writeups:     writeupRows,
      projects:     projectsRes.data || [],
      achievements: (achievementsRes.data || []).map((g) => ({
        unlocked_at: g.unlocked_at,
        ...g.achievements,
      })).filter((a) => a.id),
      certificates: certsRes.data || [],
      roadmaps_completed: completedRoadmaps,
    });
  } catch (err) {
    return sendInternalError(res, err, "fetch public portfolio");
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/portfolio/me   [AUTH]
//
// Returns the viewer's portfolio settings so the settings page can
// pre-fill the form (handle, public toggle, headline, socials).
// ────────────────────────────────────────────────────────────
export const getMyPortfolioSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("students")
      .select("handle, public_portfolio, portfolio_headline, portfolio_socials")
      .eq("user_id", req.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Student record not found" });
    return res.json({
      handle:                data.handle || null,
      public_portfolio:      Boolean(data.public_portfolio),
      portfolio_headline:    data.portfolio_headline || "",
      portfolio_socials:     data.portfolio_socials || {},
      public_url:            data.handle ? `/u/${data.handle}` : null,
    });
  } catch (err) {
    return sendInternalError(res, err, "fetch my portfolio settings");
  }
};

// ────────────────────────────────────────────────────────────
// PATCH /api/portfolio/me   [AUTH]
//
// Update the viewer's portfolio toggles. Handle changes are
// rate-limited at the SQL layer (UNIQUE on handle); we return 409
// on collision so the UI can prompt for another.
// ────────────────────────────────────────────────────────────
export const updateMyPortfolioSettings = async (req, res) => {
  try {
    const payload = {};

    // Handle — validate kebab-case, 3-40 chars.
    if (typeof req.body?.handle === "string") {
      const h = req.body.handle.trim().toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(h)) {
        return res.status(400).json({ error: "Handle must be 3-40 chars, lowercase letters/digits/hyphens, no leading or trailing hyphen." });
      }
      payload.handle = h;
    }

    if (typeof req.body?.public_portfolio === "boolean") {
      payload.public_portfolio = req.body.public_portfolio;
    }

    if (typeof req.body?.portfolio_headline === "string") {
      payload.portfolio_headline = req.body.portfolio_headline.trim().slice(0, 200) || null;
    }

    if (req.body?.portfolio_socials && typeof req.body.portfolio_socials === "object" && !Array.isArray(req.body.portfolio_socials)) {
      // Keep only known keys + bound the URL length.
      const ALLOWED = ["github", "linkedin", "twitter", "website", "kaggle", "youtube"];
      const out = {};
      for (const k of ALLOWED) {
        const v = req.body.portfolio_socials[k];
        if (typeof v === "string" && v.trim()) {
          out[k] = v.trim().slice(0, 200);
        }
      }
      payload.portfolio_socials = out;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const { data, error } = await supabase
      .from("students")
      .update(payload)
      .eq("user_id", req.userId)
      .select("handle, public_portfolio, portfolio_headline, portfolio_socials")
      .single();
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "That handle is already taken. Try another." });
      }
      throw error;
    }
    return res.json({
      handle:                data.handle,
      public_portfolio:      Boolean(data.public_portfolio),
      portfolio_headline:    data.portfolio_headline || "",
      portfolio_socials:     data.portfolio_socials || {},
      public_url:            data.handle ? `/u/${data.handle}` : null,
    });
  } catch (err) {
    return sendInternalError(res, err, "update my portfolio settings");
  }
};
