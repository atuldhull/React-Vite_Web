/**
 * computeProfileAccess — decide, for a given (viewer, target) pair,
 * what slices of the target's profile the viewer can see.
 *
 * Pure function. No I/O. The caller fetches:
 *   - target's chat_settings row (may be null — defaults apply)
 *   - the friendship status between viewer and target
 *
 * ...and hands both in. Keeping the decision logic out of the
 * controllers means:
 *   - one place to change the rules when a new privacy tier lands,
 *   - no Supabase client needed in tests,
 *   - no branch drift between /api/users/:id/profile,
 *     /api/users/:id/friends and /api/users/:id/activity — they
 *     all call this and respect its output.
 *
 * TIERS
 * ─────
 * profile_visibility: 'public' | 'friends' | 'nobody'
 *   public  — anyone in the org can view the profile page
 *   friends — only accepted friends can view; others get a private
 *             placeholder (still see name + avatar so hovercard
 *             rendering doesn't break)
 *   nobody  — only self can view. Even accepted friends get the
 *             private placeholder. This is the "I want to be on the
 *             platform but not discoverable" escape hatch.
 *
 * show_activity_feed (boolean, default TRUE)
 *   Gates the Activity tab + Recent Activity strip on Overview.
 *   Doesn't affect the rest of the profile — a user can keep their
 *   profile public but hide activity.
 *
 * show_friend_list (boolean, default TRUE)
 *   Gates the Friends tab content. The FRIEND COUNT is always
 *   visible on profiles that are visible at all (showing "42
 *   friends" doesn't leak specific identities; showing the names
 *   does).
 *
 * SELF ALWAYS WINS
 * ────────────────
 * A user looking at their own profile bypasses every gate — they
 * can see their own friend list even with show_friend_list=false
 * (that flag hides the list from OTHERS, not from yourself).
 */

// @ts-check

/**
 * @typedef {"accepted" | "pending_sent" | "pending_received" | null} FriendshipState
 * @typedef {null | {
 *   profile_visibility?: string | null,
 *   show_activity_feed?: boolean | null,
 *   show_friend_list?:   boolean | null,
 * }} SettingsRow
 * @typedef {{
 *   canViewProfile:      boolean,
 *   canViewActivityFeed: boolean,
 *   canViewFriendList:   boolean,
 *   isSelf:              boolean,
 *   isFriend:            boolean,
 *   reason:              "self" | "public" | "friend" | "private" | "blocked",
 * }} ProfileAccess
 */

/**
 * @param {{
 *   viewerId:   string,
 *   targetId:   string,
 *   settings:   SettingsRow,
 *   friendship: FriendshipState,
 *   blocked?:   boolean,
 * }} params
 * @returns {ProfileAccess}
 */
export function computeProfileAccess({ viewerId, targetId, settings, friendship, blocked = false }) {
  const isSelf   = !!viewerId && viewerId === targetId;
  const isFriend = friendship === "accepted";

  // If either party has blocked the other, treat the profile as
  // private regardless of the other settings. (The caller decides
  // whether to return 403 or a minimal card — this helper just
  // reports what the viewer is allowed to see.)
  if (blocked && !isSelf) {
    return {
      canViewProfile: false,
      canViewActivityFeed: false,
      canViewFriendList: false,
      isSelf: false,
      isFriend: false,
      reason: "blocked",
    };
  }

  // Defaults must match the DB defaults in migrations 08 + 20, or
  // users who haven't opened the settings dialog would appear locked
  // down after a code change.
  const visibility    = settings?.profile_visibility ?? "public";
  const activeFeedOk  = settings?.show_activity_feed ?? true;
  const friendListOk  = settings?.show_friend_list   ?? true;

  /** @type {ProfileAccess["reason"]} */
  let reason;
  /** @type {boolean} */
  let canViewProfile;

  if (isSelf) {
    canViewProfile = true;
    reason = "self";
  } else if (visibility === "public") {
    canViewProfile = true;
    reason = "public";
  } else if (visibility === "friends") {
    canViewProfile = isFriend;
    reason = isFriend ? "friend" : "private";
  } else {
    // 'nobody' — only self
    canViewProfile = false;
    reason = "private";
  }

  // Sub-tabs: NEVER more permissive than the profile itself. Self
  // ALWAYS sees their own stuff even if the "show to others" toggle
  // is off, because those toggles hide from OTHERS, not from self.
  const canViewActivityFeed = canViewProfile && (isSelf || activeFeedOk);
  const canViewFriendList   = canViewProfile && (isSelf || friendListOk);

  return { canViewProfile, canViewActivityFeed, canViewFriendList, isSelf, isFriend, reason };
}

/**
 * Minimal "private card" shape returned for users whose profile is
 * NOT viewable. Keeps hovercards and name displays working without
 * leaking the user's XP / title / activity.
 *
 * @param {{ id: string, name?: string | null, avatar_emoji?: string | null, avatar_color?: string | null }} student
 * @returns {{ id: string, name: string, avatar_emoji: string | null, avatar_color: string | null, isPrivate: true }}
 */
export function makePrivateProfileCard(student) {
  return {
    id:           student.id,
    name:         student.name || "Private user",
    avatar_emoji: student.avatar_emoji ?? null,
    avatar_color: student.avatar_color ?? null,
    isPrivate:    true,
  };
}
