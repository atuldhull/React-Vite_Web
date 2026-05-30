/**
 * Zod schemas for /api/user/* mutations.
 *
 * Two routes covered:
 *   PATCH /api/user/profile          — name / bio / avatar_*
 *   POST  /api/user/change-password   — currentPassword + newPassword
 *
 * The controllers already enforce a few invariants (trim, slice to 60
 * chars, password floor of 8). Pulling those into Zod here lets us:
 *   - Reject obviously-bad input BEFORE the supabase round-trip
 *     (changePassword previously called signInWithPassword with junk).
 *   - Cap field sizes so a megabyte-long "bio" can't pass the global
 *     body limit only to be silently truncated to 200 chars after.
 *   - Stop a strict-mode upsert from silently dropping unexpected keys
 *     (no .strict() on profile — UI sometimes sends partial payloads).
 */

import { z } from "zod";

/* PATCH /api/user/profile.
   Every field is optional — UI sends only what changed. Strings are
   trimmed and capped at the same limits the controller enforces, so
   the wire shape and the DB row stay aligned.
   avatar_config is the SVG-builder DSL (themed avatars) and can be
   nested + variable; we only check it's a JSON-shaped object and
   bound its serialised size so a hostile client can't ship a 200KB
   blob in a 60-char user record. */
export const updateProfileSchema = z.object({
  name:          z.string().trim().min(1, "name cannot be empty").max(60, "name too long").optional(),
  bio:           z.string().trim().max(200, "bio too long").optional(),
  avatar_emoji:  z.string().trim().max(8, "emoji too long").optional(),
  avatar_color:  z.string().trim().max(32, "color too long").optional(),
  avatar_config: z.unknown().refine(
    (v) => v === undefined || (typeof v === "object" && v !== null && JSON.stringify(v).length <= 4096),
    "avatar_config must be an object under 4 KB",
  ).optional(),
});

/* POST /api/user/change-password.
   newPassword floor is 8 (the controller's current rule). Password
   ceiling of 128 mirrors validators/auth.js — keeps bcrypt off a
   1 MB blob if the global body cap is ever raised. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "current password required").max(128, "password too long"),
  newPassword:     z.string().min(8, "new password must be at least 8 characters").max(128, "password too long"),
}).strict();
