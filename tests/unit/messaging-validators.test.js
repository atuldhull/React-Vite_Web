/**
 * Unit tests for backend/validators/messaging.js.
 *
 * Scope: pure schema parsing. No Express, no Supabase, no controllers.
 * Catches:
 *   1. Valid inputs pass (per-toggle partial updates work)
 *   2. Invalid enum values are rejected (e.g. profile_visibility="foo")
 *   3. Wrong types are rejected (boolean field given a string)
 *   4. Unknown keys are rejected — THIS IS THE IDOR GUARD.
 *      If a client sends { user_id: "other-uuid", show_last_seen: true }
 *      we must reject, not silently upsert into someone else's row.
 */

import { describe, it, expect } from "vitest";
import { updateChatSettingsSchema } from "../../backend/validators/messaging.js";

describe("updateChatSettingsSchema", () => {
  // ── Happy paths ────────────────────────────────────────────

  it("accepts an empty object (no-op PATCH is allowed)", () => {
    const r = updateChatSettingsSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("accepts a single chat-era field", () => {
    const r = updateChatSettingsSchema.safeParse({ allow_messages_from: "everyone" });
    expect(r.success).toBe(true);
    expect(r.data.allow_messages_from).toBe("everyone");
  });

  it("accepts a single profile-era field (migration 20)", () => {
    const r = updateChatSettingsSchema.safeParse({ profile_visibility: "friends" });
    expect(r.success).toBe(true);
  });

  it("accepts all seven fields at once", () => {
    const r = updateChatSettingsSchema.safeParse({
      allow_messages_from: "friends",
      show_online_status:  false,
      show_read_receipts:  false,
      show_last_seen:      true,
      profile_visibility:  "nobody",
      show_activity_feed:  false,
      show_friend_list:    true,
    });
    expect(r.success).toBe(true);
  });

  // ── Enum validation ────────────────────────────────────────

  it("rejects allow_messages_from outside the enum", () => {
    const r = updateChatSettingsSchema.safeParse({ allow_messages_from: "strangers" });
    expect(r.success).toBe(false);
  });

  it("rejects profile_visibility outside the enum", () => {
    const r = updateChatSettingsSchema.safeParse({ profile_visibility: "anyone" });
    expect(r.success).toBe(false);
  });

  // ── Type validation ────────────────────────────────────────

  it("rejects boolean fields given a string", () => {
    const r = updateChatSettingsSchema.safeParse({ show_activity_feed: "true" });
    expect(r.success).toBe(false);
  });

  it("rejects null on a boolean field (not the same as omitting)", () => {
    const r = updateChatSettingsSchema.safeParse({ show_online_status: null });
    expect(r.success).toBe(false);
  });

  // ── IDOR guard ─────────────────────────────────────────────
  // This is the regression test for the bug that prompted the
  // allowlist + strict() change: previously a client could send
  // { user_id: "other-user-uuid", ... } and the controller would
  // upsert with that user_id, overwriting another user's row.

  it("rejects an unknown key — user_id", () => {
    const r = updateChatSettingsSchema.safeParse({
      user_id: "11111111-1111-1111-1111-111111111111",
      show_last_seen: true,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown key — created_at (attempted backdating)", () => {
    const r = updateChatSettingsSchema.safeParse({
      created_at: "1970-01-01T00:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown key — arbitrary junk", () => {
    const r = updateChatSettingsSchema.safeParse({ foo: "bar" });
    expect(r.success).toBe(false);
  });
});
