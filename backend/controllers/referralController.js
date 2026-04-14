/**
 * Referral Controller
 *
 * Handles:
 *   - Generating unique referral codes
 *   - Tracking referral signups
 *   - Rewarding both referrer and referred
 *   - Anti-abuse (IP limits, self-referral prevention)
 *   - Referral leaderboard
 *   - User referral stats
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Reward constants
const REFERRER_XP = 100;    // XP for the person who invited
const REFERRED_XP = 50;     // XP bonus for the new user
const MAX_DAILY_REFERRALS_PER_IP = 3;
const MAX_TOTAL_REWARDS_PER_USER = 50; // max 50 rewarded referrals per user

/**
 * Generate a unique, readable referral code.
 * Format: MATH-XXXXX (5 alphanumeric chars)
 */
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 (avoid confusion)
  let code = "";
  const bytes = crypto.randomBytes(5);
  for (let i = 0; i < 5; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `MATH-${code}`;
}

// ═══════════════════════════════════════════════════════════
// GET OR CREATE REFERRAL CODE
// ═══════════════════════════════════════════════════════════

export async function getMyReferralCode(req, res) {
  try {
    const userId = req.session.user.id;

    // Check if user already has a code
    let { data: existing } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .single();

    if (existing) return res.json({ code: existing.code });

    // Generate a new unique code
    let code, attempts = 0;
    do {
      code = generateCode();
      const { data: taken } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("code", code)
        .single();
      if (!taken) break;
      attempts++;
    } while (attempts < 10);

    const { error } = await supabase
      .from("referral_codes")
      .insert({ user_id: userId, code });

    if (error) throw error;
    res.json({ code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// APPLY REFERRAL CODE (during or after registration)
// ═══════════════════════════════════════════════════════════

export async function applyReferralCode(req, res) {
  try {
    const referredId = req.session.user.id;
    const { code } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";

    if (!code) return res.status(400).json({ error: "Code required" });

    // ── Anti-abuse checks ──

    // 1. Check if user already has a referrer
    const { data: existingRef } = await supabase
      .from("referrals")
      .select("id")
      .eq("referred_id", referredId)
      .single();
    if (existingRef) return res.status(400).json({ error: "You already used a referral code" });

    // 2. Look up the code
    const { data: codeRecord } = await supabase
      .from("referral_codes")
      .select("user_id, code")
      .eq("code", code.toUpperCase().trim())
      .single();
    if (!codeRecord) return res.status(404).json({ error: "Invalid referral code" });

    const referrerId = codeRecord.user_id;

    // 3. Self-referral check
    if (referrerId === referredId) {
      return res.status(400).json({ error: "Cannot use your own referral code" });
    }

    // 4. IP-based daily limit
    const today = new Date().toISOString().slice(0, 10);
    const { data: ipLimit } = await supabase
      .from("referral_limits")
      .select("count")
      .eq("ip_address", ip)
      .eq("date", today)
      .single();

    if (ipLimit && ipLimit.count >= MAX_DAILY_REFERRALS_PER_IP) {
      return res.status(429).json({ error: "Too many referrals from this network today" });
    }

    // 5. Check referrer hasn't exceeded total limit
    const { count: totalRewarded } = await supabase
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", referrerId)
      .eq("status", "rewarded");

    if (totalRewarded >= MAX_TOTAL_REWARDS_PER_USER) {
      // Still track the referral but don't reward
      await supabase.from("referrals").insert({
        referrer_id: referrerId,
        referred_id: referredId,
        status: "verified",
        ip_address: ip,
        verified_at: new Date().toISOString(),
      });
      return res.json({ success: true, rewarded: false, message: "Referral tracked but referrer has reached reward limit" });
    }

    // ── Create referral record ──
    const { error: insertErr } = await supabase.from("referrals").insert({
      referrer_id: referrerId,
      referred_id: referredId,
      status: "rewarded",
      referrer_xp_awarded: REFERRER_XP,
      referred_xp_awarded: REFERRED_XP,
      ip_address: ip,
      verified_at: new Date().toISOString(),
      rewarded_at: new Date().toISOString(),
    });
    if (insertErr) throw insertErr;

    // ── Award XP to both ──
    // Referrer gets XP
    await supabase.rpc("increment_xp", { user_id_param: referrerId, xp_amount: REFERRER_XP })
      .catch(async () => {
        // Fallback if RPC doesn't exist: manual update via req.db
        // (Proxy scopes to caller's org; cross-org referrals would
        // need explicit handling here — not a current scenario.)
        const { data: referrer } = await req.db.from("students").select("xp").eq("user_id", referrerId).single();
        if (referrer) {
          await req.db.from("students").update({ xp: (referrer.xp || 0) + REFERRER_XP }).eq("user_id", referrerId);
        }
      });

    // Referred user gets bonus XP
    await supabase.rpc("increment_xp", { user_id_param: referredId, xp_amount: REFERRED_XP })
      .catch(async () => {
        const { data: referred } = await req.db.from("students").select("xp").eq("user_id", referredId).single();
        if (referred) {
          await req.db.from("students").update({ xp: (referred.xp || 0) + REFERRED_XP }).eq("user_id", referredId);
        }
      });

    // ── Update IP daily limit ──
    if (ipLimit) {
      await supabase.from("referral_limits").update({ count: ipLimit.count + 1 }).eq("ip_address", ip).eq("date", today);
    } else {
      await supabase.from("referral_limits").insert({ ip_address: ip, date: today, count: 1 });
    }

    // ── Notify referrer ──  Proxy auto-stomps org_id onto the row.
    await req.db.from("notifications").insert({
      user_id: referrerId,
      title: "🎉 Referral Reward!",
      body: `Someone joined using your code! You earned ${REFERRER_XP} XP.`,
      type: "referral",
      is_read: false,
    });

    res.json({
      success: true,
      rewarded: true,
      referrerXP: REFERRER_XP,
      referredXP: REFERRED_XP,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// REFERRAL STATS (for user's referral dashboard)
// ═══════════════════════════════════════════════════════════

export async function getMyReferralStats(req, res) {
  try {
    const userId = req.session.user.id;

    // Get referral code
    const { data: codeData } = await supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .single();

    // Count referrals by status
    const { data: referrals } = await supabase
      .from("referrals")
      .select("id, status, referrer_xp_awarded, created_at")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false });

    const total = referrals?.length || 0;
    const rewarded = referrals?.filter((r) => r.status === "rewarded").length || 0;
    const pending = referrals?.filter((r) => r.status === "pending").length || 0;
    const totalXPEarned = referrals?.reduce((sum, r) => sum + (r.referrer_xp_awarded || 0), 0) || 0;

    // Check if current user was referred
    const { data: myReferral } = await supabase
      .from("referrals")
      .select("referrer_id, referred_xp_awarded")
      .eq("referred_id", userId)
      .single();

    res.json({
      code: codeData?.code || null,
      totalInvites: total,
      successfulReferrals: rewarded,
      pendingReferrals: pending,
      totalXPEarned,
      wasReferred: !!myReferral,
      recentReferrals: (referrals || []).slice(0, 10),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// REFERRAL LEADERBOARD
// ═══════════════════════════════════════════════════════════

export async function getReferralLeaderboard(req, res) {
  try {
    // Get top referrers by rewarded count
    const { data: referrals } = await supabase
      .from("referrals")
      .select("referrer_id")
      .eq("status", "rewarded");

    if (!referrals || referrals.length === 0) return res.json([]);

    // Count per referrer
    const counts = {};
    referrals.forEach((r) => {
      counts[r.referrer_id] = (counts[r.referrer_id] || 0) + 1;
    });

    // Sort by count, take top 20
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const userIds = sorted.map(([id]) => id);
    const { data: profiles } = await req.db
      .from("students")
      .select("user_id, name, avatar_emoji, avatar_color, title")
      .in("user_id", userIds);

    const leaderboard = sorted.map(([userId, count], i) => ({
      rank: i + 1,
      userId,
      referralCount: count,
      xpEarned: count * REFERRER_XP,
      ...(profiles?.find((p) => p.user_id === userId) || {}),
    }));

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// VALIDATE CODE (public — check if code exists before signup)
// ═══════════════════════════════════════════════════════════

export async function validateCode(req, res) {
  try {
    const { code } = req.params;
    const { data } = await supabase
      .from("referral_codes")
      .select("user_id")
      .eq("code", code.toUpperCase().trim())
      .single();

    if (!data) return res.json({ valid: false });

    // Get referrer name
    const { data: profile } = await req.db
      .from("students")
      .select("name")
      .eq("user_id", data.user_id)
      .single();

    res.json({ valid: true, referrerName: profile?.name || "A member" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
