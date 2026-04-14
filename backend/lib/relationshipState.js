/**
 * computeRelationshipState — resolves the social relationship between
 * a VIEWER and a TARGET, for the sake of rendering "Add Friend" /
 * "Message" / "Friends ✓" buttons.
 *
 * Pure helper. Takes a supabase client as its first arg so tests can
 * inject a fake without needing vi.mock() gymnastics.
 *
 * SHAPE
 * ─────
 * Returns:
 *   {
 *     self:       boolean,
 *     friendship: null | "pending_sent" | "pending_received" | "accepted",
 *     blocked:    false | "by_me" | "by_them",
 *     canMessage: boolean,
 *     friendshipId: string | null,   // needed for unfriend / respond / cancel
 *   }
 *
 * SEMANTICS
 * ─────────
 * friendship:
 *   null              — no row in friendships table for this pair
 *   pending_sent      — I sent the request, waiting on them
 *   pending_received  — They sent me a request, I haven't responded
 *   accepted          — mutual friends
 *
 *   The "blocked" friendship status from the schema is NOT reported
 *   via this field — blocking is handled by user_blocks (separate
 *   table) so the two don't get conflated.
 *
 * blocked:
 *   false  — neither has blocked the other
 *   by_me  — I blocked them (they won't know, but my UI hides them)
 *   by_them — they blocked me (hide their profile / send / etc.)
 *
 * canMessage:
 *   Derived from target's chat_settings.allow_messages_from:
 *     'everyone' — true
 *     'friends'  — true iff friendship='accepted'
 *     'nobody'   — false
 *   ALSO false if either party has blocked the other, and false
 *   when self === true (can't DM yourself — the UI hides the button).
 *
 * SECURITY NOTES
 * ──────────────
 * Nothing in here is a security boundary by itself — the actual
 * write endpoints (send / respond / block) re-check their own
 * invariants. This helper is for READ-side UX decisions: which
 * button to render, whether to show the "message" action. A
 * client-faked "canMessage: true" can't actually send a message
 * if the target's settings say otherwise, because the send path
 * re-checks.
 */

// @ts-check

/**
 * @typedef {"pending_sent" | "pending_received" | "accepted" | null} FriendshipState
 * @typedef {false | "by_me" | "by_them"} BlockedState
 * @typedef {{
 *   self: boolean,
 *   friendship: FriendshipState,
 *   blocked: BlockedState,
 *   canMessage: boolean,
 *   friendshipId: string | null,
 * }} RelationshipState
 */

/** Default for the self case or for any error path — shape stays stable. */
const SELF_STATE = Object.freeze({
  self: true,
  friendship: null,
  blocked: false,
  canMessage: false,
  friendshipId: null,
});

/** Default when no rows match — stranger, no block, settings say "everyone". */
function strangerState() {
  return {
    self: false,
    friendship: null,
    blocked: /** @type {BlockedState} */ (false),
    canMessage: true,
    friendshipId: null,
  };
}

/**
 * Derive the canMessage flag from the target's chat_settings row and
 * the computed friendship state.
 *
 * @param {null | { allow_messages_from?: string | null }} settingsRow
 * @param {FriendshipState} friendship
 * @returns {boolean}
 */
function canMessageFrom(settingsRow, friendship) {
  // No row yet = app defaults. See migration 08 default.
  const policy = settingsRow?.allow_messages_from ?? "friends";
  if (policy === "nobody")   return false;
  if (policy === "everyone") return true;
  // "friends" or anything unexpected: accepted friends only.
  return friendship === "accepted";
}

/**
 * Single-pair relationship lookup. 3 queries (blocks, friendship,
 * settings). For list pages use computeRelationshipStateBatch instead
 * to avoid N * 3 queries.
 *
 * @param {any}    supabase — service-role supabase-js client
 * @param {string} viewerId
 * @param {string} targetId
 * @returns {Promise<RelationshipState>}
 */
export async function computeRelationshipState(supabase, viewerId, targetId) {
  if (!viewerId || !targetId) {
    // Caller-error; return a safe read-only stranger state. This
    // path is hit by unauthed requests that sneak past middleware
    // (shouldn't happen, but defensive).
    return strangerState();
  }
  if (viewerId === targetId) return { ...SELF_STATE };

  // Issue the three reads in parallel — they're independent.
  const [blocksRes, friendshipRes, settingsRes] = await Promise.all([
    supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId}),` +
        `and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId})`
      ),

    supabase
      .from("friendships")
      .select("id, requester_id, recipient_id, status")
      .or(
        `and(requester_id.eq.${viewerId},recipient_id.eq.${targetId}),` +
        `and(requester_id.eq.${targetId},recipient_id.eq.${viewerId})`
      )
      .limit(1)
      .maybeSingle(),

    supabase
      .from("chat_settings")
      .select("allow_messages_from")
      .eq("user_id", targetId)
      .maybeSingle(),
  ]);

  // ── blocks ──
  let blocked = /** @type {BlockedState} */ (false);
  for (const row of blocksRes.data || []) {
    if (row.blocker_id === viewerId) blocked = "by_me";
    else if (row.blocker_id === targetId) blocked = "by_them";
  }

  // ── friendship ──
  /** @type {FriendshipState} */
  let friendship = null;
  /** @type {string | null} */
  let friendshipId = null;
  const f = friendshipRes.data;
  if (f && f.status !== "blocked") {
    friendshipId = f.id;
    if (f.status === "accepted") {
      friendship = "accepted";
    } else if (f.status === "pending") {
      friendship = f.requester_id === viewerId ? "pending_sent" : "pending_received";
    }
  }

  // ── canMessage ──
  const canMessage = blocked === false
    ? canMessageFrom(settingsRes.data, friendship)
    : false;

  return { self: false, friendship, blocked, canMessage, friendshipId };
}

/**
 * Bulk variant for list pages (leaderboard, event registrants).
 * Makes exactly 3 DB queries regardless of list size — one each for
 * blocks, friendships, settings — then joins in-memory.
 *
 * Caps out at 100 target ids per call (enforced by the caller, but
 * we double-check here so a direct helper consumer doesn't DoS us
 * by accident). Over the cap: slice and call twice.
 *
 * @param {any}      supabase
 * @param {string}   viewerId
 * @param {string[]} targetIds — unique IDs, caller should dedupe
 * @returns {Promise<Record<string, RelationshipState>>}
 */
export async function computeRelationshipStateBatch(supabase, viewerId, targetIds) {
  if (!viewerId) return {};
  const ids = (targetIds || []).filter(Boolean).slice(0, 100);
  if (ids.length === 0) return {};

  const [blocksRes, friendsRes, settingsRes] = await Promise.all([
    supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(
        `and(blocker_id.eq.${viewerId},blocked_id.in.(${ids.join(",")})),` +
        `and(blocked_id.eq.${viewerId},blocker_id.in.(${ids.join(",")}))`
      ),

    supabase
      .from("friendships")
      .select("id, requester_id, recipient_id, status")
      .or(
        `and(requester_id.eq.${viewerId},recipient_id.in.(${ids.join(",")})),` +
        `and(recipient_id.eq.${viewerId},requester_id.in.(${ids.join(",")}))`
      ),

    supabase
      .from("chat_settings")
      .select("user_id, allow_messages_from")
      .in("user_id", ids),
  ]);

  // Index the block + friendship + settings rows by OTHER-user id
  // so the final assembly pass is O(N) not O(N*M).
  /** @type {Record<string, "by_me" | "by_them">} */
  const blockIdx = {};
  for (const row of blocksRes.data || []) {
    if (row.blocker_id === viewerId)  blockIdx[row.blocked_id] = "by_me";
    else                               blockIdx[row.blocker_id] = "by_them";
  }

  /** @type {Record<string, { id: string, state: FriendshipState }>} */
  const friendIdx = {};
  for (const row of friendsRes.data || []) {
    if (row.status === "blocked") continue;
    const other = row.requester_id === viewerId ? row.recipient_id : row.requester_id;
    if (row.status === "accepted") {
      friendIdx[other] = { id: row.id, state: "accepted" };
    } else if (row.status === "pending") {
      const st = row.requester_id === viewerId ? "pending_sent" : "pending_received";
      friendIdx[other] = { id: row.id, state: st };
    }
  }

  /** @type {Record<string, { allow_messages_from?: string }>} */
  const settingsIdx = {};
  for (const row of settingsRes.data || []) {
    settingsIdx[row.user_id] = row;
  }

  /** @type {Record<string, RelationshipState>} */
  const out = {};
  for (const tid of ids) {
    if (tid === viewerId) { out[tid] = { ...SELF_STATE }; continue; }
    const blocked    = blockIdx[tid] ?? /** @type {BlockedState} */ (false);
    const fi         = friendIdx[tid];
    const friendship = /** @type {FriendshipState} */ (fi?.state ?? null);
    const canMessage = blocked === false
      ? canMessageFrom(settingsIdx[tid] || null, friendship)
      : false;
    out[tid] = {
      self: false,
      friendship,
      blocked,
      canMessage,
      friendshipId: fi?.id ?? null,
    };
  }
  return out;
}
