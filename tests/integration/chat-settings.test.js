/**
 * Integration tests — GET/PATCH /api/chat/settings.
 *
 * The settings endpoints are tiny but carry two regressions worth
 * pinning:
 *   1. GET must return the Phase-15 defaults when no row exists —
 *      so the frontend doesn't show "undefined" for new users.
 *   2. PATCH must be IDOR-proof: a body containing `user_id`
 *      should be rejected by the Zod strict() guard, not silently
 *      upserted into someone else's row.
 *
 * Strategy mirrors paid-events.test.js: minimal Express app,
 * mocked supabase client, fake session middleware.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = {
  existingRow: null,     // returned from .select().eq().single()
  lastUpsert:  null,     // captured from .upsert()
};

beforeEach(() => {
  state.existingRow = null;
  state.lastUpsert  = null;
  vi.clearAllMocks();
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        select: () => chain,
        insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
        upsert: (payload) => {
          if (table === "chat_settings") state.lastUpsert = payload;
          return { then: (r) => Promise.resolve({ data: payload, error: null }).then(r) };
        },
        update:  () => ({
          eq: () => ({
            then: (r) => Promise.resolve({ data: null, error: null }).then(r),
            select: () => ({ single: async () => ({ data: null, error: null }) }),
          }),
        }),
        eq:          () => chain,
        single:      async () => {
          if (table === "chat_settings") return { data: state.existingRow, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (r) => Promise.resolve({ data: [], error: null }).then(r),
      };
      return chain;
    },
  }),
}));

vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

const messagingRoutes = (await import("../../backend/routes/messagingRoutes.js")).default;

function buildApp({ userId = "u-1" } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session  = { user: { id: userId, role: "student", is_active: true } };
    req.userId   = userId;
    req.userRole = "student";
    req.orgId    = "org-A";
    req.id       = "req-test";
    req.db = { from: () => ({}) };
    next();
  });
  app.use("/api/chat", messagingRoutes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// ════════════════════════════════════════════════════════════
// GET /api/chat/settings
// ════════════════════════════════════════════════════════════

describe("GET /api/chat/settings", () => {
  it("returns Phase-15 defaults when no row exists", async () => {
    state.existingRow = null;
    const res = await request(buildApp()).get("/api/chat/settings");
    expect(res.status).toBe(200);
    // chat-era defaults
    expect(res.body.allow_messages_from).toBe("friends");
    expect(res.body.show_online_status).toBe(true);
    // Phase 15 defaults (migration 20)
    expect(res.body.profile_visibility).toBe("public");
    expect(res.body.show_activity_feed).toBe(true);
    expect(res.body.show_friend_list).toBe(true);
  });

  it("returns the persisted row when one exists", async () => {
    state.existingRow = {
      user_id: "u-1",
      allow_messages_from: "nobody",
      profile_visibility:  "friends",
      show_activity_feed:  false,
      show_friend_list:    false,
    };
    const res = await request(buildApp()).get("/api/chat/settings");
    expect(res.status).toBe(200);
    expect(res.body.allow_messages_from).toBe("nobody");
    expect(res.body.profile_visibility).toBe("friends");
    expect(res.body.show_activity_feed).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// PATCH /api/chat/settings
// ════════════════════════════════════════════════════════════

describe("PATCH /api/chat/settings", () => {
  it("upserts a partial update with only the changed field", async () => {
    const res = await request(buildApp({ userId: "u-42" }))
      .patch("/api/chat/settings")
      .send({ show_activity_feed: false });
    expect(res.status).toBe(200);
    expect(state.lastUpsert).toEqual({ user_id: "u-42", show_activity_feed: false });
  });

  it("upserts all Phase-15 privacy toggles at once", async () => {
    const res = await request(buildApp())
      .patch("/api/chat/settings")
      .send({
        profile_visibility: "nobody",
        show_activity_feed: false,
        show_friend_list:   false,
      });
    expect(res.status).toBe(200);
    expect(state.lastUpsert.profile_visibility).toBe("nobody");
    expect(state.lastUpsert.show_activity_feed).toBe(false);
  });

  it("rejects invalid enum value for profile_visibility", async () => {
    const res = await request(buildApp())
      .patch("/api/chat/settings")
      .send({ profile_visibility: "anyone" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  // ── IDOR regression test ─────────────────────────────────
  // Pre-fix: { user_id: "other", ... } spread into the upsert
  // after user_id, overriding it and writing to another user's row.
  // Post-fix: strict() on the Zod schema rejects the whole payload.

  it("rejects a body containing user_id (IDOR guard)", async () => {
    const res = await request(buildApp({ userId: "u-me" }))
      .patch("/api/chat/settings")
      .send({
        user_id: "u-victim",
        show_last_seen: true,
      });
    expect(res.status).toBe(400);
    expect(state.lastUpsert).toBeNull();
  });

  it("rejects a body containing arbitrary junk keys", async () => {
    const res = await request(buildApp())
      .patch("/api/chat/settings")
      .send({ foo: "bar", show_online_status: true });
    expect(res.status).toBe(400);
    expect(state.lastUpsert).toBeNull();
  });

  it("accepts an empty body as a no-op PATCH", async () => {
    const res = await request(buildApp({ userId: "u-9" }))
      .patch("/api/chat/settings")
      .send({});
    expect(res.status).toBe(200);
    // Only user_id is upserted — that's fine, it's a no-op against the existing row.
    expect(state.lastUpsert).toEqual({ user_id: "u-9" });
  });
});
