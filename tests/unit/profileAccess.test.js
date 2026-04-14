/**
 * Unit tests for backend/lib/profileAccess.js.
 *
 * This helper is the single gate for every /api/users/:id/* endpoint,
 * so every branch matters. The tests map 1:1 to behaviour the UI
 * depends on — a regression here would leak activity feeds across
 * privacy boundaries or (worse) lock users out of their own profiles.
 */

import { describe, it, expect } from "vitest";
import { computeProfileAccess, makePrivateProfileCard } from "../../backend/lib/profileAccess.js";

const U_A = "user-a";
const U_B = "user-b";

describe("computeProfileAccess — self", () => {
  it("self-view bypasses every gate regardless of settings", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_A,
      settings: { profile_visibility: "nobody", show_activity_feed: false, show_friend_list: false },
      friendship: null,
    });
    expect(a.isSelf).toBe(true);
    expect(a.canViewProfile).toBe(true);
    expect(a.canViewActivityFeed).toBe(true);
    expect(a.canViewFriendList).toBe(true);
    expect(a.reason).toBe("self");
  });
});

describe("computeProfileAccess — public profile", () => {
  it("stranger sees profile when visibility=public (default)", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: null,            // no row yet = default 'public'
      friendship: null,
    });
    expect(a.canViewProfile).toBe(true);
    expect(a.canViewActivityFeed).toBe(true);
    expect(a.canViewFriendList).toBe(true);
    expect(a.reason).toBe("public");
  });

  it("explicit public is same as default", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "public" },
      friendship: null,
    });
    expect(a.canViewProfile).toBe(true);
  });

  it("activity hidden when show_activity_feed=false even on public profile", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "public", show_activity_feed: false },
      friendship: null,
    });
    expect(a.canViewProfile).toBe(true);
    expect(a.canViewActivityFeed).toBe(false);
    expect(a.canViewFriendList).toBe(true); // still true — only activity was hidden
  });

  it("friend list hidden when show_friend_list=false even on public profile", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "public", show_friend_list: false },
      friendship: null,
    });
    expect(a.canViewFriendList).toBe(false);
    expect(a.canViewActivityFeed).toBe(true);
  });
});

describe("computeProfileAccess — friends-only profile", () => {
  it("non-friend stranger is blocked", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "friends" },
      friendship: null,
    });
    expect(a.canViewProfile).toBe(false);
    expect(a.canViewActivityFeed).toBe(false);
    expect(a.canViewFriendList).toBe(false);
    expect(a.reason).toBe("private");
  });

  it("pending request doesn't grant access yet", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "friends" },
      friendship: "pending_sent",
    });
    expect(a.canViewProfile).toBe(false);
  });

  it("accepted friend gets full access", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "friends" },
      friendship: "accepted",
    });
    expect(a.canViewProfile).toBe(true);
    expect(a.isFriend).toBe(true);
    expect(a.reason).toBe("friend");
  });

  it("accepted friend with show_activity_feed=false still sees profile but not activity", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "friends", show_activity_feed: false },
      friendship: "accepted",
    });
    expect(a.canViewProfile).toBe(true);
    expect(a.canViewActivityFeed).toBe(false);
  });
});

describe("computeProfileAccess — nobody visibility", () => {
  it("nobody blocks even accepted friends", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "nobody" },
      friendship: "accepted",
    });
    expect(a.canViewProfile).toBe(false);
    expect(a.reason).toBe("private");
  });

  it("nobody still allows self-view (bypassed above)", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_A,
      settings: { profile_visibility: "nobody" },
      friendship: null,
    });
    expect(a.canViewProfile).toBe(true);
  });
});

describe("computeProfileAccess — blocked", () => {
  it("blocked flag forces full lockdown regardless of visibility", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_B,
      settings: { profile_visibility: "public" },
      friendship: "accepted",
      blocked: true,
    });
    expect(a.canViewProfile).toBe(false);
    expect(a.canViewActivityFeed).toBe(false);
    expect(a.canViewFriendList).toBe(false);
    expect(a.reason).toBe("blocked");
  });

  it("blocked flag does NOT apply to self (can't block yourself)", () => {
    const a = computeProfileAccess({
      viewerId: U_A, targetId: U_A,
      settings: null,
      friendship: null,
      blocked: true, // defensive — shouldn't happen, but test the branch
    });
    expect(a.isSelf).toBe(true);
    expect(a.canViewProfile).toBe(true);
  });
});

describe("makePrivateProfileCard", () => {
  it("returns only safe fields + isPrivate flag", () => {
    const card = makePrivateProfileCard({
      id: "u-1", name: "Atul", avatar_emoji: "🦊", avatar_color: "#f0a",
    });
    expect(card).toEqual({
      id: "u-1",
      name: "Atul",
      avatar_emoji: "🦊",
      avatar_color: "#f0a",
      isPrivate: true,
    });
  });

  it("provides a placeholder name when none is set", () => {
    const card = makePrivateProfileCard({ id: "u-1" });
    expect(card.name).toBe("Private user");
  });
});
