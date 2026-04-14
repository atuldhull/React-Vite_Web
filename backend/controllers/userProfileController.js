/**
 * User-profile aggregation controllers (Phase 15 — rich profile
 * pages). Separate from the legacy user controller so the old
 * self-profile endpoints (/api/user/profile, /api/user/student/:id)
 * stay intact while the new surface grows underneath /api/users/:id.
 *
 * ONE TENANCY INVARIANT
 * ─────────────────────
 * We read the target student through req.db (tenant-scoped) so a
 * viewer in org-A can't resolve a user_id belonging to org-B. If
 * the scoped lookup returns null, the endpoint 404s — no distinction
 * between "doesn't exist" and "exists in another org". That's
 * deliberate (avoids leaking org membership across tenants).
 *
 * PRIVACY LAYERING
 * ────────────────
 * Every endpoint here first resolves the viewer↔target relationship
 * state (via the Phase-2 helper) and feeds it to computeProfileAccess.
 * If canViewProfile is false, we return a minimal "private card" so
 * hovercards elsewhere in the app still render something safe. If
 * canViewActivityFeed / canViewFriendList are individually false, the
 * corresponding slice of the response is omitted — the frontend shows
 * a "hidden by user" placeholder for that tab.
 */

import supabase from "../config/supabase.js";
import { computeRelationshipState } from "../lib/relationshipState.js";
import { computeProfileAccess, makePrivateProfileCard } from "../lib/profileAccess.js";

/* ─────────────────────────────────────────────────────────────
   Shared helper — fetch the three pieces every endpoint needs:
   student row, target's chat_settings, relationship state.
   ───────────────────────────────────────────────────────────── */

/**
 * @param {import("express").Request} req
 * @param {string} targetId
 */
async function loadGate(req, targetId) {
  const viewerId = req.userId || req.session?.user?.id;

  // 1. Tenant-scoped student lookup — cross-org returns null.
  const { data: student, error: studentErr } = await req.db
    .from("students")
    .select("user_id, name, email, xp, weekly_xp, title, bio, avatar_emoji, avatar_color, avatar_config, role, department, created_at")
    .eq("user_id", targetId)
    .maybeSingle();

  if (studentErr) return { error: studentErr };
  if (!student)   return { notFound: true };

  // 2. Relationship state (includes settings for canMessage derivation)
  //    and fresh chat_settings read for the privacy gate. The helper
  //    already queries chat_settings internally; we issue a targeted
  //    second read here because we need the FULL settings row, not
  //    just allow_messages_from.
  const [relationship, settingsRes] = await Promise.all([
    computeRelationshipState(supabase, viewerId, targetId),
    supabase
      .from("chat_settings")
      .select("profile_visibility, show_activity_feed, show_friend_list, allow_messages_from")
      .eq("user_id", targetId)
      .maybeSingle(),
  ]);

  const access = computeProfileAccess({
    viewerId, targetId,
    settings:   settingsRes.data,
    friendship: relationship.friendship,
    blocked:    relationship.blocked !== false,
  });

  return { student, settings: settingsRes.data, relationship, access };
}

/* ─────────────────────────────────────────────────────────────
   GET /api/users/:id/profile — aggregate for the profile page
   ───────────────────────────────────────────────────────────── */

export async function getProfile(req, res) {
  try {
    const targetId = req.params.id;
    const gate = await loadGate(req, targetId);

    if (gate.error)    return res.status(500).json({ error: gate.error.message });
    if (gate.notFound) return res.status(404).json({ error: "User not found" });

    const { student, relationship, access } = gate;

    // Not viewable → minimal card + reason so the frontend can render
    // "This profile is private" with a small avatar/name rather than
    // a blank page. The FriendButton still works against this card —
    // that's the whole point of showing a private profile instead of
    // 403ing.
    if (!access.canViewProfile) {
      return res.json({
        profile: makePrivateProfileCard({ id: student.user_id, ...student }),
        access,
        relationship,
      });
    }

    // Viewable — enrich with counts. Both run in parallel; they're
    // independent read-only queries on separate tables.
    const [friendCountRes, achievementCountRes] = await Promise.all([
      supabase
        .from("friendships")
        .select("*", { count: "exact", head: true })
        .or(`requester_id.eq.${targetId},recipient_id.eq.${targetId}`)
        .eq("status", "accepted"),
      supabase
        .from("user_achievements")
        .select("*", { count: "exact", head: true })
        .eq("user_id", targetId),
    ]);

    return res.json({
      profile: {
        id:            student.user_id,
        name:          student.name,
        email:         access.isSelf ? student.email : undefined, // email leaks only to self
        xp:            student.xp,
        weekly_xp:     student.weekly_xp,
        title:         student.title,
        bio:           student.bio,
        avatar_emoji:  student.avatar_emoji,
        avatar_color:  student.avatar_color,
        avatar_config: student.avatar_config,
        role:          student.role,
        department:    student.department,
        created_at:    student.created_at,
        friend_count:       friendCountRes.count || 0,
        achievement_count:  achievementCountRes.count || 0,
      },
      access,
      relationship,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────────
   GET /api/users/:id/friends — target's accepted friends list.
   Paginated via ?page=N&limit=M (default 20 per page, capped at 50).
   Each entry is flagged with `isMutual: true` when the friend is
   ALSO a friend of the viewer — the Overview tab's "mutual friends"
   strip uses this to stylise rows.
   ───────────────────────────────────────────────────────────── */

export async function getFriendsList(req, res) {
  try {
    const targetId = req.params.id;
    const viewerId = req.userId;

    const page  = Math.max(1,  parseInt(req.query.page  || "1",  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const gate = await loadGate(req, targetId);
    if (gate.error)    return res.status(500).json({ error: gate.error.message });
    if (gate.notFound) return res.status(404).json({ error: "User not found" });

    const { access } = gate;

    // If profile itself isn't viewable, no friends list.
    if (!access.canViewProfile) {
      return res.status(403).json({ error: "Profile is private", access });
    }

    // If friend-list toggle is off for non-self, return an EMPTY
    // list with a `hiddenByUser: true` flag so the UI can render
    // "This user's friends list is hidden" rather than "no friends".
    if (!access.canViewFriendList) {
      return res.json({ friends: [], total: 0, hiddenByUser: true, page, limit });
    }

    // 1. Fetch target's friendships (accepted) — paginated.
    //    Supabase's .range() maps to OFFSET/LIMIT.
    const { data: friendships, count } = await supabase
      .from("friendships")
      .select("id, requester_id, recipient_id, created_at", { count: "exact" })
      .or(`requester_id.eq.${targetId},recipient_id.eq.${targetId}`)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!friendships || friendships.length === 0) {
      return res.json({ friends: [], total: count || 0, hiddenByUser: false, page, limit });
    }

    // 2. Derive the "other side" for each row — the actual friend id.
    const friendIds = friendships.map((f) =>
      f.requester_id === targetId ? f.recipient_id : f.requester_id,
    );

    // 3. Fetch the friend profiles (tenant-scoped via req.db) + the
    //    VIEWER's friend set to compute isMutual flags.
    const [profilesRes, viewerFriendsRes] = await Promise.all([
      req.db
        .from("students")
        .select("user_id, name, title, xp, avatar_emoji, avatar_color")
        .in("user_id", friendIds),
      // Viewer's own accepted friendships — used to intersect with
      // the target's friend ids. Done client-side because Supabase
      // doesn't have a cheap intersect operator.
      supabase
        .from("friendships")
        .select("requester_id, recipient_id")
        .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`)
        .eq("status", "accepted"),
    ]);

    const viewerFriends = new Set(
      (viewerFriendsRes.data || []).map((f) =>
        f.requester_id === viewerId ? f.recipient_id : f.requester_id,
      ),
    );

    const profileMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p]));
    const friends = friendIds
      .map((id) => {
        const p = profileMap.get(id);
        if (!p) return null; // in-org filter dropped a cross-org row
        return {
          id:           p.user_id,
          name:         p.name,
          title:        p.title,
          xp:           p.xp,
          avatar_emoji: p.avatar_emoji,
          avatar_color: p.avatar_color,
          isMutual:     viewerFriends.has(id),
        };
      })
      .filter(Boolean);

    res.json({ friends, total: count || 0, hiddenByUser: false, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────────
   GET /api/users/:id/activity — merged timeline of social events.
   Combines event registrations + achievement unlocks, sorted by
   time descending. Pagination is offset/limit; default 20 items.
   Respects the show_activity_feed toggle.
   ───────────────────────────────────────────────────────────── */

export async function getActivity(req, res) {
  try {
    const targetId = req.params.id;

    const page  = Math.max(1,  parseInt(req.query.page  || "1",  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));

    const gate = await loadGate(req, targetId);
    if (gate.error)    return res.status(500).json({ error: gate.error.message });
    if (gate.notFound) return res.status(404).json({ error: "User not found" });

    const { access } = gate;

    if (!access.canViewProfile) {
      return res.status(403).json({ error: "Profile is private", access });
    }
    if (!access.canViewActivityFeed) {
      return res.json({ items: [], hiddenByUser: true, page, limit, hasMore: false });
    }

    // Fetch a window twice the page size from each source so merge +
    // slice stays correct at page boundaries. We don't try to do
    // cross-source keyset pagination — at club scale a 100-row fetch
    // per source per page is fine and the code stays linear.
    const perSourceCap = (page * limit) + limit;

    const [eventsRes, achievementsRes] = await Promise.all([
      supabase
        .from("event_registrations")
        .select("id, registered_at, status, events:event_id(id, title, event_type, starts_at)")
        .eq("user_id", targetId)
        .order("registered_at", { ascending: false })
        .limit(perSourceCap),
      supabase
        .from("user_achievements")
        .select("id, unlocked_at, xp_awarded, achievements:achievement_id(id, slug, title, icon, rarity)")
        .eq("user_id", targetId)
        .order("unlocked_at", { ascending: false })
        .limit(perSourceCap),
    ]);

    /** @type {{ kind: "event" | "achievement", at: string, data: any }[]} */
    const merged = [];

    for (const row of eventsRes.data || []) {
      merged.push({
        kind: "event",
        at:   row.registered_at,
        data: {
          id:         row.id,
          status:     row.status,
          event_id:   row.events?.id,
          title:      row.events?.title,
          event_type: row.events?.event_type,
          starts_at:  row.events?.starts_at,
        },
      });
    }

    for (const row of achievementsRes.data || []) {
      merged.push({
        kind: "achievement",
        at:   row.unlocked_at,
        data: {
          id:         row.id,
          slug:       row.achievements?.slug,
          title:      row.achievements?.title,
          icon:       row.achievements?.icon,
          rarity:     row.achievements?.rarity,
          xp_awarded: row.xp_awarded,
        },
      });
    }

    // Stable sort by timestamp DESC.
    merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const offset = (page - 1) * limit;
    const pageItems = merged.slice(offset, offset + limit);
    const hasMore   = merged.length > offset + limit;

    res.json({ items: pageItems, hiddenByUser: false, page, limit, hasMore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/* ─────────────────────────────────────────────────────────────
   GET /api/users/:id/mutual-friends — the intersection of my
   accepted friends and the target's accepted friends. Powers the
   Overview tab's "You and 6 others share…" avatar strip.
   Capped at 50 returned rows — past that the strip truncates to
   an "+N more" link anyway.
   ───────────────────────────────────────────────────────────── */

export async function getMutualFriends(req, res) {
  try {
    const targetId = req.params.id;
    const viewerId = req.userId;

    if (viewerId === targetId) {
      // Asking "what friends do I share with myself?" — return my own
      // friend list? Ambiguous. We return empty since the UI shouldn't
      // render a mutual-friends strip on self-profiles (self already
      // sees their own Friends tab).
      return res.json({ mutual: [], count: 0 });
    }

    const gate = await loadGate(req, targetId);
    if (gate.error)    return res.status(500).json({ error: gate.error.message });
    if (gate.notFound) return res.status(404).json({ error: "User not found" });
    if (!gate.access.canViewProfile) {
      return res.status(403).json({ error: "Profile is private" });
    }

    // Both-side fetch, intersect client-side.
    const [myRes, theirRes] = await Promise.all([
      supabase
        .from("friendships")
        .select("requester_id, recipient_id")
        .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`)
        .eq("status", "accepted"),
      supabase
        .from("friendships")
        .select("requester_id, recipient_id")
        .or(`requester_id.eq.${targetId},recipient_id.eq.${targetId}`)
        .eq("status", "accepted"),
    ]);

    const mine  = new Set((myRes.data   || []).map((f) => f.requester_id === viewerId ? f.recipient_id : f.requester_id));
    const their = new Set((theirRes.data || []).map((f) => f.requester_id === targetId ? f.recipient_id : f.requester_id));

    const mutualIds = [...mine].filter((id) => their.has(id)).slice(0, 50);
    if (mutualIds.length === 0) return res.json({ mutual: [], count: 0 });

    const { data: profiles } = await req.db
      .from("students")
      .select("user_id, name, avatar_emoji, avatar_color")
      .in("user_id", mutualIds);

    res.json({
      mutual: (profiles || []).map((p) => ({
        id:           p.user_id,
        name:         p.name,
        avatar_emoji: p.avatar_emoji,
        avatar_color: p.avatar_color,
      })),
      count: mutualIds.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
