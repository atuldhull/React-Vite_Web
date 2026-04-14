/**
 * Integration tests for the Phase-15 relationship endpoints.
 *
 * Scope:
 *   GET    /api/chat/relationship/:userId
 *   POST   /api/chat/relationships/batch
 *   POST   /api/chat/friends/request/cancel
 *   DELETE /api/chat/friends/:friendshipId
 *
 * The computeRelationshipState logic itself has unit-test coverage
 * in tests/unit/relationshipState.test.js. These tests pin the
 * HTTP contracts — status codes, body shape, validator behaviour,
 * IDOR guards — not the helper's internals.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const state = {
  // For the relationship GET — we mock the helper via vi.mock below
  // but still need routed controller/middleware behaviour, so the
  // supabase chain stubs can stay minimal.
  friendshipRow:  null,   // returned by .from("friendships").single()
  deletedRows:   [],       // returned by .delete().select() for cancelFriendRequest
  lastDeleteFilters: [],   // captures .eq() calls for inspection
};

beforeEach(() => {
  state.friendshipRow = null;
  state.deletedRows   = [];
  state.lastDeleteFilters = [];
  vi.clearAllMocks();
});

// Mock the relationship helper so the GET endpoints return a
// predictable shape without us having to drive supabase through
// three query paths. The endpoints themselves are trivial wrappers
// around the helper, so this is appropriate.
vi.mock("../../backend/lib/relationshipState.js", () => ({
  computeRelationshipState: vi.fn(async (_supabase, viewerId, targetId) => {
    if (viewerId === targetId) return { self: true, friendship: null, blocked: false, canMessage: false, friendshipId: null };
    return { self: false, friendship: "accepted", blocked: false, canMessage: true, friendshipId: "fake-id" };
  }),
  computeRelationshipStateBatch: vi.fn(async (_supabase, viewerId, ids) => {
    const out = {};
    for (const id of ids) {
      out[id] = id === viewerId
        ? { self: true,  friendship: null,       blocked: false, canMessage: false, friendshipId: null }
        : { self: false, friendship: "accepted", blocked: false, canMessage: true,  friendshipId: "fake-id" };
    }
    return out;
  }),
}));

// Supabase mock — only needs to handle the two controller operations
// that DON'T go through the helper: cancelFriendRequest (.delete())
// and unfriend (.maybeSingle() then .delete()).
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table: table,
        select: () => chain,
        insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
        update: () => ({
          eq: () => ({
            then: (r) => Promise.resolve({ data: null, error: null }).then(r),
            select: () => ({ single: async () => ({ data: null, error: null }) }),
          }),
        }),
        upsert: () => ({ then: (r) => Promise.resolve({ data: null, error: null }).then(r) }),
        delete: () => {
          const deleteChain = {
            _eqCount: 0,
            eq: function (col, val) {
              state.lastDeleteFilters.push([col, val]);
              return this;
            },
            select: () => ({
              then: (r) => Promise.resolve({ data: state.deletedRows, error: null }).then(r),
            }),
            // Plain delete().eq().eq() without .select() chain
            then: (r) => Promise.resolve({ data: state.deletedRows, error: null }).then(r),
          };
          return deleteChain;
        },
        eq:          () => chain,
        in:          () => chain,
        or:          () => chain,
        limit:       () => chain,
        single:      async () => ({ data: state.friendshipRow, error: null }),
        maybeSingle: async () => ({ data: state.friendshipRow, error: null }),
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

function buildApp({ userId = "11111111-1111-1111-1111-111111111111" } = {}) {
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

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

// ════════════════════════════════════════════════════════════
// GET /api/chat/relationship/:userId
// ════════════════════════════════════════════════════════════

describe("GET /api/chat/relationship/:userId", () => {
  it("returns the helper's state unchanged", async () => {
    const res = await request(buildApp({ userId: UUID_A })).get(`/api/chat/relationship/${UUID_B}`);
    expect(res.status).toBe(200);
    expect(res.body.self).toBe(false);
    expect(res.body.friendship).toBe("accepted");
    expect(res.body.canMessage).toBe(true);
  });

  it("returns SELF state when viewing own id", async () => {
    const res = await request(buildApp({ userId: UUID_A })).get(`/api/chat/relationship/${UUID_A}`);
    expect(res.status).toBe(200);
    expect(res.body.self).toBe(true);
    expect(res.body.canMessage).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/chat/relationships/batch
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/relationships/batch", () => {
  it("returns a map keyed by userId", async () => {
    const res = await request(buildApp({ userId: UUID_A }))
      .post("/api/chat/relationships/batch")
      .send({ userIds: [UUID_B, UUID_C] });
    expect(res.status).toBe(200);
    expect(res.body[UUID_B].friendship).toBe("accepted");
    expect(res.body[UUID_C].friendship).toBe("accepted");
  });

  it("400 on empty userIds", async () => {
    const res = await request(buildApp())
      .post("/api/chat/relationships/batch")
      .send({ userIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("400 on >100 userIds (DoS cap)", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => {
      // Pad an incrementing number into a valid UUID shape so the item
      // regex passes — we're testing the .max(100) on the array, not
      // each item's uuid regex.
      const hex = i.toString(16).padStart(12, "0");
      return `11111111-1111-1111-1111-${hex}`;
    });
    const res = await request(buildApp())
      .post("/api/chat/relationships/batch")
      .send({ userIds: ids });
    expect(res.status).toBe(400);
  });

  it("400 on non-UUID string in the list", async () => {
    const res = await request(buildApp())
      .post("/api/chat/relationships/batch")
      .send({ userIds: ["not-a-uuid"] });
    expect(res.status).toBe(400);
  });

  it("400 on extra keys (strict)", async () => {
    const res = await request(buildApp())
      .post("/api/chat/relationships/batch")
      .send({ userIds: [UUID_B], admin: true });
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/chat/friends/request/cancel
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/friends/request/cancel", () => {
  it("400 when recipientId is missing", async () => {
    const res = await request(buildApp())
      .post("/api/chat/friends/request/cancel")
      .send({});
    expect(res.status).toBe(400);
  });

  it("400 when recipientId is not a UUID", async () => {
    const res = await request(buildApp())
      .post("/api/chat/friends/request/cancel")
      .send({ recipientId: "x" });
    expect(res.status).toBe(400);
  });

  it("404 when no pending request matched (the deletedRows mock stays empty)", async () => {
    state.deletedRows = [];
    const res = await request(buildApp({ userId: UUID_A }))
      .post("/api/chat/friends/request/cancel")
      .send({ recipientId: UUID_B });
    expect(res.status).toBe(404);
  });

  it("200 when a pending request was deleted", async () => {
    state.deletedRows = [{ id: "fr-1" }];
    const res = await request(buildApp({ userId: UUID_A }))
      .post("/api/chat/friends/request/cancel")
      .send({ recipientId: UUID_B });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Verify the delete was scoped to (my requester_id, recipient_id, status=pending)
    const filters = Object.fromEntries(state.lastDeleteFilters);
    expect(filters.requester_id).toBe(UUID_A);
    expect(filters.recipient_id).toBe(UUID_B);
    expect(filters.status).toBe("pending");
  });
});

// ════════════════════════════════════════════════════════════
// DELETE /api/chat/friends/:friendshipId (unfriend)
// ════════════════════════════════════════════════════════════

describe("DELETE /api/chat/friends/:friendshipId", () => {
  it("404 when friendship not found", async () => {
    state.friendshipRow = null;
    const res = await request(buildApp()).delete("/api/chat/friends/fr-missing");
    expect(res.status).toBe(404);
  });

  it("400 when friendship is still pending (wrong endpoint — cancel instead)", async () => {
    state.friendshipRow = {
      id: "fr-1", requester_id: UUID_A, recipient_id: UUID_B, status: "pending",
    };
    const res = await request(buildApp({ userId: UUID_A })).delete("/api/chat/friends/fr-1");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancel for pending/i);
  });

  it("403 when the viewer is neither the requester nor the recipient", async () => {
    state.friendshipRow = {
      id: "fr-1", requester_id: UUID_B, recipient_id: UUID_C, status: "accepted",
    };
    // Viewer is UUID_A, not in the friendship.
    const res = await request(buildApp({ userId: UUID_A })).delete("/api/chat/friends/fr-1");
    expect(res.status).toBe(403);
  });

  it("200 when viewer is the requester of an accepted friendship", async () => {
    state.friendshipRow = {
      id: "fr-1", requester_id: UUID_A, recipient_id: UUID_B, status: "accepted",
    };
    const res = await request(buildApp({ userId: UUID_A })).delete("/api/chat/friends/fr-1");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("200 when viewer is the recipient of an accepted friendship", async () => {
    state.friendshipRow = {
      id: "fr-1", requester_id: UUID_B, recipient_id: UUID_A, status: "accepted",
    };
    const res = await request(buildApp({ userId: UUID_A })).delete("/api/chat/friends/fr-1");
    expect(res.status).toBe(200);
  });
});
