/**
 * Zod schemas for /api/chat/* mutations.
 *
 * Focused on the SETTINGS + RELATIONSHIP surface — the E2EE message
 * bodies themselves aren't validated here (the ciphertext shape is
 * enforced by the E2EE client library; the server can't read it).
 *
 * WHY A SEPARATE FILE
 * ───────────────────
 * `messaging` is a big surface (chat, friends, blocks, reports,
 * settings) and mixing it into validators/common.js would bloat a
 * file whose purpose is to be tiny and reusable. Keeping it
 * feature-scoped also means grep for "allow_messages_from" lands
 * in one file, not four.
 */

import { z } from "zod";

/* ─────────────────────────────────────────────────────────────
   Relationship endpoints (Phase 15 — rich profile integration)
   ───────────────────────────────────────────────────────────── */

// UUID shape — Supabase user_ids are standard RFC-4122 uuids.
// We accept lowercase hex only; deliberately not z.uuid() because
// that's stricter than practical (it rejects some lowercase variants
// that Supabase happily round-trips).
const uuidStr = z.string().trim().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  "must be a UUID",
);

/**
 * POST /api/chat/relationships/batch — bulk relationship lookup.
 *
 * The cap is 100 ids per call for DoS protection: three queries
 * each with an IN-list of 100 is ~300 id comparisons per request,
 * cheap. Callers with >100 ids should paginate client-side.
 */
export const batchRelationshipsSchema = z.object({
  userIds: z.array(uuidStr).min(1, "userIds must not be empty").max(100, "cap is 100 per call"),
}).strict();

/** POST /api/chat/friends/request/cancel */
export const cancelFriendRequestSchema = z.object({
  recipientId: uuidStr,
}).strict();

/* ─────────────────────────────────────────────────────────────
   Chat + profile privacy settings (PATCH /api/chat/settings)
   ───────────────────────────────────────────────────────────── */

// allow_messages_from — migration 08
const allowMessagesFrom = z.enum(["everyone", "friends", "nobody"]);

// profile_visibility — migration 20 (Phase 15)
const profileVisibility = z.enum(["public", "friends", "nobody"]);

// All settings are PARTIAL — the UI sends only the fields the user
// changed, and the allowlist in updateChatSettings silently drops
// anything not present. Strict-empty would break per-toggle PATCHes.
export const updateChatSettingsSchema = z.object({
  // chat-era
  allow_messages_from: allowMessagesFrom.optional(),
  show_online_status:  z.boolean().optional(),
  show_read_receipts:  z.boolean().optional(),
  show_last_seen:      z.boolean().optional(),
  // profile-era (migration 20)
  profile_visibility:  profileVisibility.optional(),
  show_activity_feed:  z.boolean().optional(),
  show_friend_list:    z.boolean().optional(),
}).strict();  // reject unknown keys — catches typos + IDOR attempts like `user_id: "other"`

/* ─────────────────────────────────────────────────────────────
   E2EE public key + conversation + message + block / report
   ───────────────────────────────────────────────────────────── */

/* POST /api/chat/keys/register
   publicKey is the curve25519 public half of the user's identity
   keypair (registered once per device after the on-boarding ceremony).
   The server only round-trips it as opaque JSON, so we don't validate
   internal shape — but we cap the serialised size so a hostile client
   can't ship a multi-MB blob to bloat the user_public_keys row.
   8 KB is far past any real keypair (~100 bytes) but stops abuse. */
export const registerPublicKeySchema = z.object({
  publicKey: z.unknown().refine(
    (v) => v !== undefined && v !== null && JSON.stringify(v).length <= 8 * 1024,
    "publicKey required and must serialise to under 8 KB",
  ),
}).strict();

/* POST /api/chat/friends/request */
export const sendFriendRequestSchema = z.object({
  recipientId: uuidStr,
}).strict();

/* POST /api/chat/friends/respond */
export const respondFriendRequestSchema = z.object({
  requestId: uuidStr,
  accept:    z.boolean(),
}).strict();

/* POST /api/chat/conversations */
export const getOrCreateConversationSchema = z.object({
  otherUserId: uuidStr,
}).strict();

/* POST /api/chat/messages
   encryptedContent is an opaque ciphertext blob the server cannot
   read. We cap it at 64 KB — large enough for any real chat message
   even with key-rotation overhead, small enough that the table can't
   be DoS'd with a flood of MB-sized "messages".
   iv (nonce) is a fixed 12 bytes when base64'd → ~16 chars; we use a
   generous 64-char ceiling to allow for future scheme tweaks.
   messageType is informational; default 'text' is enforced by the
   controller via `messageType || "text"`. */
export const sendMessageSchema = z.object({
  conversationId:   uuidStr,
  encryptedContent: z.string().min(1, "encryptedContent required").max(64 * 1024, "message ciphertext too large"),
  iv:               z.string().min(1, "iv required").max(64, "iv too long"),
  messageType:      z.enum(["text", "image", "file", "system"]).optional(),
}).strict();

/* POST /api/chat/messages/read */
export const markAsReadSchema = z.object({
  conversationId: uuidStr,
}).strict();

/* POST /api/chat/block */
export const blockUserSchema = z.object({
  blockedId: uuidStr,
}).strict();

/* POST /api/chat/report
   reason is free-text but capped — it lands in an admin queue, not
   a public surface, so we don't sanitise it harder than length-limit. */
export const reportMessageSchema = z.object({
  messageId: uuidStr,
  reason:    z.string().trim().max(500, "reason too long").optional(),
}).strict();
