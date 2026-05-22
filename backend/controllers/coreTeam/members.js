/**
 * Core Team — members, teams, access-code redemption, leaderboard.
 */
import supabase from "../../config/supabase.js";
import { catchAsync } from "../../lib/asyncHandler.js";

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Random 4-char suffix for a fresh ASYM-XXXX access code. */
function freshCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `ASYM-${s}`;
}

/* GET /api/core/me — am I a core member? (no requireCoreMember guard) */
export const getMe = catchAsync(async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: "Login required" });

  const { data } = await supabase
    .from("core_members")
    .select("*, core_teams(id, name, slug, accent)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return res.json({ isCoreMember: false });

  // Rank within the member's team (for the dashboard "you're #N" line).
  let teamRank = null;
  if (data.team_id) {
    const { data: peers } = await supabase
      .from("core_members")
      .select("id, points")
      .eq("team_id", data.team_id)
      .eq("is_active", true)
      .order("points", { ascending: false });
    const idx = (peers || []).findIndex((p) => p.id === data.id);
    if (idx >= 0) teamRank = { rank: idx + 1, of: peers.length };
  }

  return res.json({ isCoreMember: true, member: data, teamRank });
});

/* POST /api/core/redeem — link an access code to the logged-in account */
export const redeemCode = catchAsync(async (req, res) => {
  const user = req.session?.user;
  if (!user) return res.status(401).json({ error: "Login required" });

  // Normalise: codes are stored upper-case; accept any casing / spacing.
  const code = String(req.body.code || "").trim().toUpperCase();

  const { data: row, error: lookupErr } = await supabase
    .from("core_members")
    .select("*")
    .eq("access_code", code)
    .maybeSingle();

  // A missing table means migration 25 hasn't been run — say so plainly
  // instead of the misleading "code doesn't match".
  if (lookupErr) {
    return res.status(500).json({
      error: "The Core Team tables aren't set up yet. An admin needs to run migration 25 in Supabase.",
    });
  }
  if (!row) return res.status(404).json({ error: "That code doesn't match any core member." });
  if (!row.is_active) return res.status(403).json({ error: "This core membership is inactive." });

  // Already linked to this account → idempotent success.
  if (row.user_id && row.user_id === user.id) {
    return res.json({ success: true, alreadyRedeemed: true, member: row });
  }
  // Linked to a different account — one code, one person.
  if (row.user_id && row.user_id !== user.id) {
    return res.status(409).json({ error: "This code has already been redeemed by another account." });
  }

  // The private code IS the credential — whoever holds it redeems it
  // onto the account they're signed in with. We deliberately do NOT
  // require the seeded email to match the login email: members
  // registered their site accounts with assorted addresses, and the
  // old email check rejected those legitimate redemptions.
  const { data: linked, error } = await supabase
    .from("core_members")
    .update({ user_id: user.id, redeemed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("user_id", null)            // race guard — second concurrent redeemer matches 0 rows
    .select("*, core_teams(id, name, slug, accent)")
    .maybeSingle();

  if (error || !linked) {
    return res.status(409).json({ error: "That code was just redeemed on another account." });
  }
  return res.json({ success: true, member: linked });
});

/* GET /api/core/teams — all teams with their members */
export const listTeams = catchAsync(async (req, res) => {
  const { data: teams } = await supabase.from("core_teams").select("*").order("name");
  const { data: members } = await supabase
    .from("core_members")
    .select("id, name, email, team_id, position, tier, points, user_id, redeemed_at")
    .eq("is_active", true)
    .order("points", { ascending: false });

  const council = (members || []).filter((m) => m.tier === "council");
  const byTeam = (teams || []).map((t) => ({
    ...t,
    members: (members || []).filter((m) => m.team_id === t.id),
  }));

  return res.json({ council, teams: byTeam });
});

/* GET /api/core/leaderboard — points ranking, grouped by team */
export const leaderboard = catchAsync(async (req, res) => {
  const { data: teams } = await supabase.from("core_teams").select("*").order("name");
  const { data: members } = await supabase
    .from("core_members")
    .select("id, name, team_id, tier, points, user_id")
    .eq("is_active", true)
    .order("points", { ascending: false });

  const groups = (teams || []).map((t) => ({
    team: t,
    members: (members || []).filter((m) => m.team_id === t.id),
  }));
  const overall = (members || []).slice(0, 10);

  return res.json({ groups, overall });
});

/* POST /api/core/teams — council only */
export const createTeam = catchAsync(async (req, res) => {
  const { name, description, accent } = req.body;
  const slug = slugify(name);

  const { data: existing } = await supabase
    .from("core_teams").select("id").or(`name.eq.${name},slug.eq.${slug}`).maybeSingle();
  if (existing) return res.status(409).json({ error: "A team with that name already exists." });

  const { data, error } = await supabase
    .from("core_teams")
    .insert({ name, slug, description: description || null, accent: accent || "#7c3aed" })
    .select().single();
  if (error) return res.status(500).json({ error: "Could not create team." });
  return res.status(201).json({ success: true, team: data });
});

/* POST /api/core/members — council only — add a member + issue a code */
export const addMember = catchAsync(async (req, res) => {
  const { name, email, teamId, position, tier } = req.body;

  const { data: dup } = await supabase
    .from("core_members").select("id").eq("email", email).maybeSingle();
  if (dup) return res.status(409).json({ error: "That email is already a core member." });

  // Generate a unique code (retry a couple of times on the rare clash).
  let code = freshCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase
      .from("core_members").select("id").eq("access_code", code).maybeSingle();
    if (!clash) break;
    code = freshCode();
  }

  const { data, error } = await supabase
    .from("core_members")
    .insert({
      name, email,
      team_id:  teamId || null,
      position: position || (tier === "head" ? "Head" : "Member"),
      tier:     tier || "member",
      access_code: code,
    })
    .select("*, core_teams(id, name, slug, accent)")
    .single();
  if (error) return res.status(500).json({ error: "Could not add member." });

  // The council member who added them needs the code to hand over.
  return res.status(201).json({ success: true, member: data, accessCode: code });
});

/* GET /api/core/badge/:userId — core-team badge for any user (or null).
   Used by the main site profile pages to show a Council/Head/Core tag. */
export const getBadge = catchAsync(async (req, res) => {
  const { data } = await supabase
    .from("core_members")
    .select("tier, position, core_teams(name)")
    .eq("user_id", req.params.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return res.json({ isCoreMember: false });
  return res.json({
    isCoreMember: true,
    tier:     data.tier,
    position: data.position,
    team:     data.core_teams?.name || null,
  });
});
