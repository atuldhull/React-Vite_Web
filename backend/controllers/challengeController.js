import { logger } from "../config/logger.js";
// Tenant scoping: every DB call below uses req.db.from(...). The
// Proxy chains eq("org_id", req.orgId) on reads/updates/deletes and
// stomps org_id onto inserts. So a teacher in org A creating a
// challenge can't accidentally tag it to org B, and the leaderboard
// ("get next challenge for user") is now naturally scoped to the
// caller's org. The raw `supabase` import is intentionally absent.

/* GET CURRENT ACTIVE CHALLENGE — GET /api/challenge/current */
export const getCurrentChallenge = async (req, res) => {
  try {
    logger.info("Challenge fetching current active challenge...");

    const { data, error } = await req.db
      .from("challenges")
      .select("id, title, question, options, correct_index, difficulty, points, solution, is_active, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error({ err: error }, "Challenge DB error");
      return res.status(500).json({ error: error.message });
    }

    if (!data) {
      logger.info("Challenge no active challenges found");
      return res.status(404).json({
        error: "no_challenge",
        message: "No active challenge found. Run migration.sql and import challenges."
      });
    }

    // Fix options: if it came back as a string (bad CSV import), parse it
    if (typeof data.options === "string") {
      try {
        // Handle PostgreSQL array format: {"opt1","opt2","opt3","opt4"}
        data.options = data.options
          .replace(/^\{|\}$/g, "")
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .map(s => s.replace(/^"|"$/g, "").replace(/""/g, '"'));
        logger.info("Challenge parsed options from string to array");
      } catch (e) {
        logger.error({ err: e }, "Challenge failed to parse options");
      }
    }

    data.difficulty = (data.difficulty || "medium").toUpperCase();

    logger.info({ title: data.title, difficulty: data.difficulty }, "Challenge returning");
    return res.json(data);

  } catch (err) {
    logger.error({ err: err }, "Challenge unexpected error");
    return res.status(500).json({ error: "Failed to fetch challenge" });
  }
};

/* GET ALL CHALLENGES — GET /api/challenge/all */
export const getAllChallenges = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("challenges")
      .select("id, title, difficulty, points, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json((data || []).map(c => ({
      ...c, difficulty: (c.difficulty || "medium").toUpperCase(),
    })));
  } catch {
    return res.status(500).json({ error: "Failed to fetch challenges" });
  }
};

/* GET SINGLE — GET /api/challenge/:id */
export const getChallengeById = async (req, res) => {
  try {
    const { data, error } = await req.db
      .from("challenges").select("*").eq("id", req.params.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: "Challenge not found" });
    data.difficulty = (data.difficulty || "medium").toUpperCase();
    return res.json(data);
  } catch { return res.status(500).json({ error: "Failed" }); }
};

/* CREATE — POST /api/challenge */
export const createChallenge = async (req, res) => {
  try {
    const { title, question, options, correct_index, difficulty, points, solution } = req.body;
    if (!title || !question || !options || correct_index === undefined)
      return res.status(400).json({ error: "Missing required fields" });
    if (!Array.isArray(options) || options.length !== 4)
      return res.status(400).json({ error: "options must be array of 4" });

    const { data, error } = await req.db.from("challenges").insert({
      title, question, options,
      correct_index: Number(correct_index),
      difficulty:    (difficulty || "medium").toLowerCase(),
      points:        Number(points) || 50,
      solution:      solution || null,
      is_active:     true,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ success: true, challenge: data });
  } catch { return res.status(500).json({ error: "Failed to create" }); }
};

/* UPDATE — PATCH /api/challenge/:id */
export const updateChallenge = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.difficulty) updates.difficulty = updates.difficulty.toLowerCase();
    if (updates.correct_index !== undefined) updates.correct_index = Number(updates.correct_index);
    if (updates.points !== undefined) updates.points = Number(updates.points);
    const { data, error } = await req.db.from("challenges").update(updates).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, challenge: data });
  } catch { return res.status(500).json({ error: "Failed to update" }); }
};

/* DELETE — DELETE /api/challenge/:id */
export const deleteChallenge = async (req, res) => {
  try {
    const { error } = await req.db.from("challenges").delete().eq("id", req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: "Failed to delete" }); }
};

/* TOGGLE — PATCH /api/challenge/:id/toggle */
export const toggleChallenge = async (req, res) => {
  try {
    const { data: current } = await req.db.from("challenges").select("is_active").eq("id", req.params.id).maybeSingle();
    const { data, error } = await req.db.from("challenges").update({ is_active: !current?.is_active }).eq("id", req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, is_active: data.is_active });
  } catch { return res.status(500).json({ error: "Failed to toggle" }); }
};


/* ─────────────────────────────────────
   GET NEXT UNSOLVED CHALLENGE FOR USER
   Route: GET /api/challenge/next
   Returns a random active challenge the user hasn't attempted yet.
   Falls back to any active challenge if all are solved.
───────────────────────────────────── */
export const getNextChallenge = async (req, res) => {
  const userId     = req.session?.user?.id;
  const difficulty = req.query.difficulty; // optional filter

  try {
    // Get IDs of challenges this user already attempted
    let attemptedIds = [];
    if (userId) {
      const { data: attempts } = await req.db
        .from("arena_attempts")
        .select("challenge_id")
        .eq("user_id", userId);
      attemptedIds = (attempts || []).map(a => a.challenge_id);
    }

    // Fetch all active challenges (optionally filtered by difficulty)
    let query = req.db
      .from("challenges")
      .select("id, title, question, options, correct_index, difficulty, points, solution, is_active, created_at")
      .eq("is_active", true);

    if (difficulty && difficulty !== 'all') {
      query = query.eq("difficulty", difficulty.toLowerCase());
    }

    const { data: all, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    if (!all || all.length === 0) return res.status(404).json({ error: "no_challenge", message: "No active challenges." });

    // Filter to unsolved ones
    const unsolved = all.filter(c => !attemptedIds.includes(c.id));
    const pool = unsolved.length > 0 ? unsolved : all; // fallback: repeat if all solved

    // Pick a random one from the pool
    const challenge = pool[Math.floor(Math.random() * pool.length)];

    // Fix options if string
    if (typeof challenge.options === "string") {
      challenge.options = challenge.options
        .replace(/^\{|\}$/g, "")
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map(s => s.replace(/^"|"$/g, "").replace(/""/g, '"'));
    }

    challenge.difficulty = (challenge.difficulty || "medium").toUpperCase();

    const allSolved = unsolved.length === 0;
    return res.json({ ...challenge, allSolved, remaining: unsolved.length });

  } catch (err) {
    logger.error({ err: err }, "Challenge/next error");
    return res.status(500).json({ error: "Failed to fetch next challenge" });
  }
};
