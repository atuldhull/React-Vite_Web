/**
 * Integration tests for /api/users/:id/* (Phase 15 profile
 * aggregation).
 *
 * The privacy logic has its own unit coverage in
 * tests/unit/profileAccess.test.js. These tests cover the HTTP
 * contract: status codes, cross-org isolation, hiddenByUser flags,
 * pagination shape, self vs. other branching.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = {
  student:   null,   // req.db.from("students").eq(user_id).maybeSingle()
  settings:  null,   // chat_settings row
  friendship: null,  // relationship helper will read this via our vi.mock below
  friendsOfTarget:    [],
  friendsOfViewer:    [],
  eventRegistrations: [],
  userAchievements:   [],
  mutualProfiles:     [],
  friendCountRes:   0,
  achievementCountRes: 0,
  studentsIn:    [],   // for batch student fetches
};

beforeEach(() => {
  state.student   = null;
  state.settings  = null;
  state.friendship = null;
  state.friendsOfTarget    = [];
  state.friendsOfViewer    = [];
  state.eventRegistrations = [];
  state.userAchievements   = [];
  state.mutualProfiles     = [];
  state.friendCountRes     = 0;
  state.achievementCountRes = 0;
  state.studentsIn = [];
  vi.clearAllMocks();
});

// Mock the relationshipState helper — the profile controller calls
// it for the relationship hint included in the response, but every
// branch has its own unit tests so we stub it to a predictable value.
vi.mock("../../backend/lib/relationshipState.js", () => ({
  computeRelationshipState: vi.fn(async (_sb, viewerId, targetId) => {
    if (viewerId === targetId) return { self: true, friendship: null, blocked: false, canMessage: false, friendshipId: null };
    return {
      self: false,
      friendship: state.friendship,
      blocked: false,
      canMessage: true,
      friendshipId: state.friendship === "accepted" ? "fr-x" : null,
    };
  }),
}));

// Supabase mock. Different tables drive different parts of state.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      // Dedicated handler for .select(..., { count: "exact", head: true }) —
      // used by the profile aggregate for friend/achievement counts.
      let countOnly = false;
      const chain = {
        _table: table,
        select: (_cols, opts) => {
          if (opts?.count === "exact" && opts?.head === true) countOnly = true;
          return chain;
        },
        // authMiddleware.requireAuth fires a fire-and-forget
        // .update({ last_seen_at }).eq(user_id, ...).then() on every
        // protected request. The chain must include a thenable after
        // .eq() or the awaited promise throws "then is not a function".
        update: () => ({
          eq: () => ({
            then:   (r) => Promise.resolve({ data: null, error: null }).then(r),
            catch:  () => {},
            select: () => ({ single: async () => ({ data: null, error: null }) }),
          }),
        }),
        eq:    () => chain,
        in:    () => chain,
        or:    () => chain,
        order: () => chain,
        limit: () => chain,
        range: () => chain,
        maybeSingle: async () => {
          if (table === "students")      return { data: state.student,  error: null };
          if (table === "chat_settings") return { data: state.settings, error: null };
          return { data: null, error: null };
        },
        then: (r) => {
          let payload;
          if (countOnly) {
            const count = table === "friendships" ? state.friendCountRes
                        : table === "user_achievements" ? state.achievementCountRes
                        : 0;
            payload = { data: null, count, error: null };
          } else {
            switch (table) {
              case "friendships":
                // Two callers: full friendships list for target, and for viewer.
                // We differentiate by the current state pointer — tests set
                // friendsOfTarget first (called first in the Promise.all pair),
                // friendsOfViewer second. Simpler: return UNION and let the
                // controller's .or() logic filter.
                payload = { data: [...state.friendsOfTarget, ...state.friendsOfViewer], error: null, count: state.friendCountRes };
                break;
              case "students":          payload = { data: state.studentsIn, error: null }; break;
              case "event_registrations": payload = { data: state.eventRegistrations, error: null }; break;
              case "user_achievements":   payload = { data: state.userAchievements, error: null }; break;
              default:                    payload = { data: [], error: null };
            }
          }
          return Promise.resolve(payload).then(r);
        },
      };
      return chain;
    },
  }),
}));

vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

const userProfileRoutes = (await import("../../backend/routes/userProfileRoutes.js")).default;

const VIEWER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TARGET = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function buildApp({ userId = VIEWER } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session  = { user: { id: userId, role: "student", is_active: true } };
    req.userId   = userId;
    req.userRole = "student";
    req.orgId    = "org-A";
    req.id       = "req-test";
    // Minimal req.db proxy: routes every .from("students") call to
    // the mocked supabase client (which reads from state).
    const rawMock = (table) => {
      const { createClient } = require_mocked();
      return createClient().from(table);
    };
    req.db = { from: (t) => rawMock(t) };
    next();
  });
  app.use("/api/users", userProfileRoutes);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  return app;
}

// Helper to import the vitest-mocked supabase module via static import
// (dynamic import + vi.mock is fine, but a synchronous accessor is
// less error-prone in buildApp).
import * as supabaseMod from "@supabase/supabase-js";
function require_mocked() { return supabaseMod; }

// ════════════════════════════════════════════════════════════
// GET /api/users/:id/profile
// ════════════════════════════════════════════════════════════

describe("GET /api/users/:id/profile", () => {
  it("404 when the user isn't in the viewer's org (tenant scope returns null)", async () => {
    state.student = null;
    const res = await request(buildApp()).get(`/api/users/${TARGET}/profile`);
    expect(res.status).toBe(404);
  });

  it("returns full profile + counts when visibility=public (default)", async () => {
    state.student = {
      user_id: TARGET, name: "Alice", email: "a@x", xp: 100, weekly_xp: 30,
      title: "Scholar", bio: null, avatar_emoji: "🐱", avatar_color: "#f0a",
      avatar_config: null, role: "student", department: "AIML", created_at: "2026-01-01",
    };
    state.settings = null; // defaults
    state.friendship = null;
    state.friendCountRes = 12;
    state.achievementCountRes = 5;

    const res = await request(buildApp()).get(`/api/users/${TARGET}/profile`);
    expect(res.status).toBe(200);
    expect(res.body.profile.name).toBe("Alice");
    expect(res.body.profile.friend_count).toBe(12);
    expect(res.body.profile.achievement_count).toBe(5);
    expect(res.body.access.canViewProfile).toBe(true);
    // Email is hidden from non-self viewers.
    expect(res.body.profile.email).toBeUndefined();
  });

  it("returns private card when visibility=friends and viewer is stranger", async () => {
    state.student = {
      user_id: TARGET, name: "Bob", avatar_emoji: "🦊", avatar_color: "#0af",
    };
    state.settings = { profile_visibility: "friends" };
    state.friendship = null;

    const res = await request(buildApp()).get(`/api/users/${TARGET}/profile`);
    expect(res.status).toBe(200);
    expect(res.body.profile.isPrivate).toBe(true);
    expect(res.body.profile.name).toBe("Bob"); // name + avatar still shown
    expect(res.body.access.canViewProfile).toBe(false);
    expect(res.body.access.reason).toBe("private");
  });

  it("friends-only profile opens up for accepted friends", async () => {
    state.student = {
      user_id: TARGET, name: "Carol", xp: 200, email: "c@x",
    };
    state.settings = { profile_visibility: "friends" };
    state.friendship = "accepted";

    const res = await request(buildApp()).get(`/api/users/${TARGET}/profile`);
    expect(res.status).toBe(200);
    expect(res.body.access.canViewProfile).toBe(true);
    expect(res.body.access.reason).toBe("friend");
    // Still no email leak — email is gated by isSelf, not by friend status.
    expect(res.body.profile.email).toBeUndefined();
  });

  it("self-view bypasses visibility=nobody and includes email", async () => {
    state.student = {
      user_id: VIEWER, name: "Me", email: "me@x", xp: 500,
    };
    state.settings = { profile_visibility: "nobody" };

    const res = await request(buildApp({ userId: VIEWER })).get(`/api/users/${VIEWER}/profile`);
    expect(res.status).toBe(200);
    expect(res.body.access.isSelf).toBe(true);
    expect(res.body.access.canViewProfile).toBe(true);
    expect(res.body.profile.email).toBe("me@x");
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/users/:id/friends
// ════════════════════════════════════════════════════════════

describe("GET /api/users/:id/friends", () => {
  it("403 when target's profile is private", async () => {
    state.student  = { user_id: TARGET, name: "X" };
    state.settings = { profile_visibility: "nobody" };
    const res = await request(buildApp()).get(`/api/users/${TARGET}/friends`);
    expect(res.status).toBe(403);
  });

  it("returns { hiddenByUser: true } when show_friend_list=false and viewer is not self", async () => {
    state.student  = { user_id: TARGET, name: "X" };
    state.settings = { profile_visibility: "public", show_friend_list: false };
    const res = await request(buildApp()).get(`/api/users/${TARGET}/friends`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenByUser).toBe(true);
    expect(res.body.friends).toEqual([]);
  });

  it("returns empty list when target has no accepted friendships", async () => {
    state.student          = { user_id: TARGET, name: "X" };
    state.settings         = { profile_visibility: "public" };
    state.friendsOfTarget  = [];
    const res = await request(buildApp()).get(`/api/users/${TARGET}/friends`);
    expect(res.status).toBe(200);
    expect(res.body.friends).toEqual([]);
    expect(res.body.hiddenByUser).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/users/:id/activity
// ════════════════════════════════════════════════════════════

describe("GET /api/users/:id/activity", () => {
  it("403 when profile is private", async () => {
    state.student  = { user_id: TARGET, name: "X" };
    state.settings = { profile_visibility: "nobody" };
    const res = await request(buildApp()).get(`/api/users/${TARGET}/activity`);
    expect(res.status).toBe(403);
  });

  it("returns hiddenByUser when show_activity_feed=false", async () => {
    state.student  = { user_id: TARGET, name: "X" };
    state.settings = { profile_visibility: "public", show_activity_feed: false };
    const res = await request(buildApp()).get(`/api/users/${TARGET}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.hiddenByUser).toBe(true);
    expect(res.body.items).toEqual([]);
  });

  it("merges events + achievements sorted by timestamp DESC", async () => {
    state.student  = { user_id: TARGET, name: "X" };
    state.settings = { profile_visibility: "public" };
    state.eventRegistrations = [
      { id: "r-1", registered_at: "2026-04-01T00:00:00Z", status: "attended", events: { id: "e-1", title: "Hackathon", event_type: "hackathon" } },
      { id: "r-2", registered_at: "2026-03-15T00:00:00Z", status: "registered", events: { id: "e-2", title: "Pi Day", event_type: "social" } },
    ];
    state.userAchievements = [
      { id: "ua-1", unlocked_at: "2026-03-20T00:00:00Z", xp_awarded: 50, achievements: { slug: "first_event", title: "First Steps", icon: "🎯", rarity: "common" } },
    ];
    const res = await request(buildApp()).get(`/api/users/${TARGET}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    // DESC order: Hackathon (Apr 1), Achievement (Mar 20), Pi Day (Mar 15)
    expect(res.body.items[0].kind).toBe("event");
    expect(res.body.items[0].data.title).toBe("Hackathon");
    expect(res.body.items[1].kind).toBe("achievement");
    expect(res.body.items[2].data.title).toBe("Pi Day");
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/users/:id/mutual-friends
// ════════════════════════════════════════════════════════════

describe("GET /api/users/:id/mutual-friends", () => {
  it("returns empty on self-view (UI doesn't render the strip for self)", async () => {
    state.student  = { user_id: VIEWER, name: "Me" };
    state.settings = null;
    const res = await request(buildApp({ userId: VIEWER })).get(`/api/users/${VIEWER}/mutual-friends`);
    expect(res.status).toBe(200);
    expect(res.body.mutual).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("403 when target profile is private", async () => {
    state.student  = { user_id: TARGET, name: "X" };
    state.settings = { profile_visibility: "nobody" };
    const res = await request(buildApp()).get(`/api/users/${TARGET}/mutual-friends`);
    expect(res.status).toBe(403);
  });
});
