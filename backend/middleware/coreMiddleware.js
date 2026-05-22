/**
 * middleware/coreMiddleware.js
 *
 * Gatekeeping for the Core Team portal (/api/core/*).
 *
 * The portal sits ON TOP of the normal student account: a user is a
 * core member only once they've redeemed their access code, which
 * links a `core_members` row to their `user_id`. These middlewares
 * resolve that row and attach it as `req.coreMember`.
 *
 * Tier ladder:  council  >  head  >  member
 *   - council  → the 4 office-bearers; can add teams + members
 *   - head     → one per team; confirms their team's task submissions
 *   - member   → everyone else
 *
 * Mount AFTER requireAuth so req.session.user is populated.
 */

import supabase from "../config/supabase.js";
import { logger } from "../config/logger.js";

/** Resolve the caller's core_members row (or null). Caches on req. */
async function loadCoreMember(req) {
  if (req._coreMemberLoaded) return req.coreMember;
  req._coreMemberLoaded = true;

  const userId = req.session?.user?.id;
  if (!userId) { req.coreMember = null; return null; }

  const { data, error } = await supabase
    .from("core_members")
    .select("*, core_teams(id, name, slug, accent)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) logger.error({ err: error }, "loadCoreMember");
  req.coreMember = data || null;
  return req.coreMember;
}

/** Requires the caller to be a redeemed, active core member. */
export const requireCoreMember = async (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Login required" });
  try {
    const member = await loadCoreMember(req);
    if (!member) {
      return res.status(403).json({ error: "Core team access required", code: "NOT_CORE_MEMBER" });
    }
    next();
  } catch (err) {
    logger.error({ err }, "requireCoreMember");
    return res.status(500).json({ error: "Core access check failed" });
  }
};

/**
 * Requires the caller's tier to be one of `tiers`.
 * Usage: requireCoreTier(["council"])  ·  requireCoreTier(["council","head"])
 */
export const requireCoreTier = (tiers) => async (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: "Login required" });
  try {
    const member = await loadCoreMember(req);
    if (!member) {
      return res.status(403).json({ error: "Core team access required", code: "NOT_CORE_MEMBER" });
    }
    if (!tiers.includes(member.tier)) {
      return res.status(403).json({ error: "Higher core privileges required" });
    }
    next();
  } catch (err) {
    logger.error({ err }, "requireCoreTier");
    return res.status(500).json({ error: "Core access check failed" });
  }
};

export { loadCoreMember };
