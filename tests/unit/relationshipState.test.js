/**
 * Unit tests for backend/lib/relationshipState.js.
 *
 * Pure helper — we inject a fake supabase client (just a chainable
 * object whose terminal methods return canned data) and verify every
 * branch of the state machine.
 *
 * The helper is the SINGLE SOURCE OF TRUTH for "which button should
 * this user see on that profile", so it's worth pinning every case.
 */

import { describe, it, expect } from "vitest";
import {
  computeRelationshipState,
  computeRelationshipStateBatch,
} from "../../backend/lib/relationshipState.js";

/**
 * Build a fake supabase client. Each table returns chainable stubs;
 * the terminal methods (.maybeSingle, .or-then, .in-then) resolve
 * to data taken from the `data` map keyed by table name.
 */
function fakeSupabase({ blocks = [], friendship = null, settings = null, batchBlocks = [], batchFriends = [], batchSettings = [] } = {}) {
  return {
    from: (table) => {
      const chain = {
        _table: table,
        select: () => chain,
        eq:     () => chain,
        in:     () => chain,
        or:     () => chain,
        limit:  () => chain,
        maybeSingle: async () => {
          if (table === "friendships")     return { data: friendship, error: null };
          if (table === "chat_settings")   return { data: settings,   error: null };
          return { data: null, error: null };
        },
        // Terminal "then" for the .or() + non-single queries
        then: (r) => {
          if (table === "user_blocks")     return Promise.resolve({ data: blocks.length > 0 ? blocks : batchBlocks, error: null }).then(r);
          if (table === "friendships")     return Promise.resolve({ data: batchFriends,  error: null }).then(r);
          if (table === "chat_settings")   return Promise.resolve({ data: batchSettings, error: null }).then(r);
          return Promise.resolve({ data: [], error: null }).then(r);
        },
      };
      return chain;
    },
  };
}

// ════════════════════════════════════════════════════════════
// Single-pair lookups
// ════════════════════════════════════════════════════════════

describe("computeRelationshipState — single", () => {
  it("returns SELF state when viewerId === targetId", async () => {
    const s = await computeRelationshipState(fakeSupabase(), "u1", "u1");
    expect(s.self).toBe(true);
    expect(s.friendship).toBeNull();
    expect(s.canMessage).toBe(false);
  });

  it("returns stranger state (no rows) — canMessage defaults to 'friends' policy → false", async () => {
    // No settings row = default policy 'friends'. Not friends yet → canMessage=false.
    const s = await computeRelationshipState(fakeSupabase(), "u1", "u2");
    expect(s.self).toBe(false);
    expect(s.friendship).toBeNull();
    expect(s.blocked).toBe(false);
    expect(s.canMessage).toBe(false);
  });

  it("canMessage=true when target's policy is 'everyone'", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({ settings: { allow_messages_from: "everyone" } }),
      "u1", "u2",
    );
    expect(s.canMessage).toBe(true);
  });

  it("canMessage=false when target's policy is 'nobody', even for accepted friends", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({
        friendship: { id: "f1", requester_id: "u1", recipient_id: "u2", status: "accepted" },
        settings:   { allow_messages_from: "nobody" },
      }),
      "u1", "u2",
    );
    expect(s.friendship).toBe("accepted");
    expect(s.canMessage).toBe(false);
  });

  it("friendship=pending_sent when viewer is requester", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({
        friendship: { id: "f1", requester_id: "u1", recipient_id: "u2", status: "pending" },
      }),
      "u1", "u2",
    );
    expect(s.friendship).toBe("pending_sent");
    expect(s.friendshipId).toBe("f1");
  });

  it("friendship=pending_received when viewer is recipient", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({
        friendship: { id: "f1", requester_id: "u2", recipient_id: "u1", status: "pending" },
      }),
      "u1", "u2",
    );
    expect(s.friendship).toBe("pending_received");
  });

  it("friendship='blocked' row is IGNORED (not surfaced as 'accepted' etc.)", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({
        friendship: { id: "f1", requester_id: "u1", recipient_id: "u2", status: "blocked" },
      }),
      "u1", "u2",
    );
    expect(s.friendship).toBeNull();
  });

  it("blocked='by_me' when viewer blocked target", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({ blocks: [{ blocker_id: "u1", blocked_id: "u2" }] }),
      "u1", "u2",
    );
    expect(s.blocked).toBe("by_me");
    expect(s.canMessage).toBe(false);
  });

  it("blocked='by_them' when target blocked viewer", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({ blocks: [{ blocker_id: "u2", blocked_id: "u1" }] }),
      "u1", "u2",
    );
    expect(s.blocked).toBe("by_them");
    expect(s.canMessage).toBe(false);
  });

  it("block OVERRIDES everything — can't message even if accepted friends with 'everyone' policy", async () => {
    const s = await computeRelationshipState(
      fakeSupabase({
        blocks:     [{ blocker_id: "u1", blocked_id: "u2" }],
        friendship: { id: "f1", requester_id: "u1", recipient_id: "u2", status: "accepted" },
        settings:   { allow_messages_from: "everyone" },
      }),
      "u1", "u2",
    );
    expect(s.blocked).toBe("by_me");
    expect(s.canMessage).toBe(false);
  });

  it("defensive: empty ids return stranger state (no crash)", async () => {
    const s = await computeRelationshipState(fakeSupabase(), "", "u2");
    expect(s.self).toBe(false);
    expect(s.canMessage).toBe(true); // stranger default (no settings row)
  });
});

// ════════════════════════════════════════════════════════════
// Batch lookups
// ════════════════════════════════════════════════════════════

describe("computeRelationshipStateBatch", () => {
  it("returns {} for empty id list", async () => {
    const out = await computeRelationshipStateBatch(fakeSupabase(), "u1", []);
    expect(out).toEqual({});
  });

  it("assembles per-user state from batched queries", async () => {
    const out = await computeRelationshipStateBatch(
      fakeSupabase({
        batchBlocks: [
          { blocker_id: "u1", blocked_id: "u3" },
        ],
        batchFriends: [
          { id: "f1", requester_id: "u1", recipient_id: "u2", status: "accepted" },
          { id: "f2", requester_id: "u4", recipient_id: "u1", status: "pending" },
        ],
        batchSettings: [
          { user_id: "u2", allow_messages_from: "everyone" },
          { user_id: "u5", allow_messages_from: "nobody"   },
        ],
      }),
      "u1",
      ["u2", "u3", "u4", "u5", "u6"],
    );

    // u2: accepted friend, 'everyone' policy → canMessage true
    expect(out.u2.friendship).toBe("accepted");
    expect(out.u2.canMessage).toBe(true);

    // u3: blocked by me
    expect(out.u3.blocked).toBe("by_me");
    expect(out.u3.canMessage).toBe(false);

    // u4: pending request received
    expect(out.u4.friendship).toBe("pending_received");

    // u5: no friendship, 'nobody' policy → canMessage false
    expect(out.u5.friendship).toBeNull();
    expect(out.u5.canMessage).toBe(false);

    // u6: no rows at all, default 'friends' policy → canMessage false
    expect(out.u6.canMessage).toBe(false);
  });

  it("caps at 100 targets — over-cap silently sliced", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `u${i}`);
    const out = await computeRelationshipStateBatch(fakeSupabase(), "viewer", ids);
    // Only first 100 processed
    expect(Object.keys(out).length).toBe(100);
  });

  it("filters out falsy ids before querying", async () => {
    const out = await computeRelationshipStateBatch(fakeSupabase(), "u1", ["u2", "", null, undefined, "u3"]);
    expect(Object.keys(out).sort()).toEqual(["u2", "u3"]);
  });

  it("viewerId appearing in the target list returns SELF state for it", async () => {
    const out = await computeRelationshipStateBatch(fakeSupabase(), "u1", ["u1", "u2"]);
    expect(out.u1.self).toBe(true);
  });
});
