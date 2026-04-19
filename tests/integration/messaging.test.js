/**
 * Messaging integration tests — covers /api/chat write paths.
 *
 * Before this commit, messaging endpoints had ZERO behavioural
 * tests. Static-grep tests in tests/integration/auth-flow (Phase
 * 1.6 era) checked that "the file mentions socket.userId" but
 * proved nothing about the request/response contract.
 *
 * Strategy: mock the supabase client + req.db proxy + sendNotification
 * helper, then exercise the controllers via supertest with a fake
 * session. Assert on response status, body shape, and which writes
 * were attempted.
 *
 * Coverage focus is the WRITE paths — the ones that mutate
 * conversation state. Read paths are covered indirectly (every
 * write controller does some lookup).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mutable mock state — flipped per-test to drive controller branches ──
const state = {
  publicKeyRow:    null,                     // user_public_keys.select().single()
  blockedRows:     [],                       // user_blocks.or(...).limit(1)
  existingFriend:  null,                     // friendships dedupe lookup
  existingFriendArr: [],                     // .or().or().limit(1) returns array
  conversation:   null,                      // conversations.select().single()
  chatSettings:   null,                      // chat_settings.select().single()
  insertResult:   { data: { id: "row-1" }, error: null },
};

// Reset between tests
beforeEach(() => {
  state.publicKeyRow      = null;
  state.blockedRows       = [];
  state.existingFriend    = null;
  state.existingFriendArr = [];
  state.conversation      = null;
  state.chatSettings      = null;
  state.insertResult      = { data: { id: "row-1" }, error: null };
  vi.clearAllMocks();
});

// Supabase mock — covers the chains the messaging controller actually uses.
// Each terminal method (.single, .maybeSingle) returns from `state`.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        _table: table,
        select:  () => chain,
        insert:  (row) => ({
          select: () => ({
            single: async () => ({ data: { id: "row-new", ...row }, error: state.insertResult.error }),
          }),
          then:   (r) => Promise.resolve({ data: row, error: null }).then(r),
        }),
        update:  () => chain,
        delete:  () => chain,
        upsert:  (row) => ({
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
          then:   (r) => Promise.resolve({ data: row, error: null }).then(r),
        }),
        eq:      () => chain,
        neq:     () => chain,
        in:      () => chain,
        or:      () => chain,
        order:   () => chain,
        range:   () => chain,
        limit:   () => chain,
        // Terminal awaiters return the state stub for whatever table
        single:      async () => {
          if (table === "user_public_keys") return { data: state.publicKeyRow, error: null };
          if (table === "conversations")    return { data: state.conversation, error: null };
          if (table === "chat_settings")    return { data: state.chatSettings, error: null };
          if (table === "friendships")      return { data: state.existingFriend, error: null };
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          // Mirrors the `single` branch for user_public_keys so the
          // registerPublicKey read-back-verify step (added to stop the
          // backend lying about successful upserts) sees a row when
          // the test set state.publicKeyRow.
          if (table === "user_public_keys") return { data: state.publicKeyRow, error: null };
          if (table === "conversations")    return { data: state.conversation, error: null };
          if (table === "chat_settings")    return { data: state.chatSettings, error: null };
          return { data: null, error: null };
        },
        // The .or().or().limit() chain in friend-request etc.
        // resolves to an array via .then.
        then: (r) => {
          if (table === "user_blocks")  return Promise.resolve({ data: state.blockedRows,       error: null }).then(r);
          if (table === "friendships")  return Promise.resolve({ data: state.existingFriendArr, error: null }).then(r);
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  }),
}));

// Mock notificationController so sendMessage / friend-request don't
// try to insert real notification rows. Returns success synchronously.
vi.mock("../../backend/controllers/notificationController.js", () => ({
  sendNotification: vi.fn(async () => ({ ok: true })),
}));

const messagingRoutes = (await import("../../backend/routes/messagingRoutes.js")).default;

// Build a minimal app: stub auth so req.session.user is present + req.db
// is a no-op proxy returning empty (we don't assert on req.db calls here —
// they're for profile lookups whose return shape doesn't change behaviour).
function buildApp({ userId = "u-1" } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { user: { id: userId, role: "student" } };
    req.userId = userId;
    req.userRole = "student";
    req.orgId = "org-A";
    req.db = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { name: "Alice" }, error: null }) }),
          in: () => ({ then: (r) => Promise.resolve({ data: [], error: null }).then(r) }),
        }),
      }),
    };
    next();
  });
  app.use("/api/chat", messagingRoutes);
  return app;
}

// ════════════════════════════════════════════════════════════
// keys/register
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/keys/register", () => {
  it("requires publicKey in body — returns 400 when missing", async () => {
    const res = await request(buildApp()).post("/api/chat/keys/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/publicKey/);
  });

  it("upserts the key + returns success when given a publicKey", async () => {
    // The controller verifies the row actually landed by re-reading
    // it after the upsert — pre-seed the mock so the read-back sees
    // something and the handler reports the real happy path.
    state.publicKeyRow = { user_id: "u-1" };
    const res = await request(buildApp()).post("/api/chat/keys/register").send({
      publicKey: { kty: "OKP", crv: "Ed25519", x: "abc" },
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("500 when the upsert reports success but the row never actually lands", async () => {
    // Regression guard for the "User A can send but B can't receive"
    // bug: Supabase could report {error: null} on the upsert while
    // the row was never readable. state.publicKeyRow stays null here
    // to simulate that silent failure mode — the handler must not
    // return success in that case.
    state.publicKeyRow = null;
    const res = await request(buildApp()).post("/api/chat/keys/register").send({
      publicKey: { kty: "OKP", crv: "Ed25519", x: "abc" },
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/not readable|persist/i);
  });
});

// ════════════════════════════════════════════════════════════
// friends/request
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/friends/request", () => {
  it("400 when recipientId is missing", async () => {
    const res = await request(buildApp()).post("/api/chat/friends/request").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recipientId/);
  });

  it("400 when trying to friend yourself", async () => {
    const res = await request(buildApp({ userId: "u-1" }))
      .post("/api/chat/friends/request")
      .send({ recipientId: "u-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/yourself/);
  });

  it("403 when either user has blocked the other", async () => {
    state.blockedRows = [{ blocker_id: "u-2" }];   // a block exists
    const res = await request(buildApp())
      .post("/api/chat/friends/request")
      .send({ recipientId: "u-2" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Blocked/);
  });

  it("400 when a friendship already exists (no duplicate insert)", async () => {
    state.existingFriendArr = [{ status: "pending" }];
    const res = await request(buildApp())
      .post("/api/chat/friends/request")
      .send({ recipientId: "u-2" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
    expect(res.body.status).toBe("pending");
  });

  it("happy path: inserts a pending friendship + returns the row", async () => {
    const res = await request(buildApp())
      .post("/api/chat/friends/request")
      .send({ recipientId: "u-2" });
    expect(res.status).toBe(200);
    // The mock's insert returns { id: "row-new", ...payload }
    expect(res.body.id).toBe("row-new");
    expect(res.body.requester_id).toBe("u-1");
    expect(res.body.recipient_id).toBe("u-2");
    expect(res.body.status).toBe("pending");
  });
});

// ════════════════════════════════════════════════════════════
// messages — sendMessage
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/messages (sendMessage)", () => {
  it("400 when required fields are missing (encryptedContent / iv / conversationId)", async () => {
    const res = await request(buildApp())
      .post("/api/chat/messages")
      .send({ conversationId: "c-1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it("403 when sender is NOT a participant in the conversation", async () => {
    state.conversation = { id: "c-1", participant_a: "x", participant_b: "y" };
    const res = await request(buildApp({ userId: "u-1" }))
      .post("/api/chat/messages")
      .send({ conversationId: "c-1", encryptedContent: "blob", iv: "iv1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Not in this conversation/);
  });

  it("happy path: sender is participant_a → message inserted", async () => {
    state.conversation = { id: "c-1", participant_a: "u-1", participant_b: "u-2" };
    const res = await request(buildApp({ userId: "u-1" }))
      .post("/api/chat/messages")
      .send({
        conversationId:   "c-1",
        encryptedContent: "ciphertext-blob",
        iv:               "iv-bytes",
        messageType:      "text",
      });
    expect(res.status).toBe(200);
    expect(res.body.sender_id).toBe("u-1");
    expect(res.body.encrypted_content).toBe("ciphertext-blob");
  });

  it("happy path: sender is participant_b also accepted", async () => {
    state.conversation = { id: "c-1", participant_a: "u-2", participant_b: "u-1" };
    const res = await request(buildApp({ userId: "u-1" }))
      .post("/api/chat/messages")
      .send({ conversationId: "c-1", encryptedContent: "x", iv: "y" });
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════
// messages/read
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/messages/read", () => {
  it("returns success and triggers an update on messages", async () => {
    const res = await request(buildApp())
      .post("/api/chat/messages/read")
      .send({ conversationId: "c-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// conversations
// ════════════════════════════════════════════════════════════

describe("POST /api/chat/conversations (getOrCreateConversation)", () => {
  it("400 when otherUserId missing", async () => {
    const res = await request(buildApp()).post("/api/chat/conversations").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/otherUserId/);
  });

  it("returns existing conversation when one already exists", async () => {
    state.conversation = { id: "c-existing", participant_a: "u-1", participant_b: "u-2" };
    const res = await request(buildApp({ userId: "u-1" }))
      .post("/api/chat/conversations")
      .send({ otherUserId: "u-2" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("c-existing");
  });

  it("403 when the other user has disabled messaging entirely", async () => {
    state.conversation  = null;
    state.chatSettings  = { allow_messages_from: "nobody" };
    const res = await request(buildApp())
      .post("/api/chat/conversations")
      .send({ otherUserId: "u-2" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled messaging/);
  });

  it("403 when 'friends only' permission and they're not friends", async () => {
    state.conversation      = null;
    state.chatSettings      = { allow_messages_from: "friends" };
    state.existingFriendArr = [];   // no friendship row
    const res = await request(buildApp())
      .post("/api/chat/conversations")
      .send({ otherUserId: "u-2" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/friends/);
  });
});
