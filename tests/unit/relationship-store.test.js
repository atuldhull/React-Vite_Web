/**
 * Unit tests for frontend/src/store/relationship-store.js.
 *
 * Focus: cache + dedupe + invalidation semantics. The store is the
 * glue between 20+ UI components and the backend — a regression
 * here (e.g. losing dedupe and issuing N fetches per render) would
 * show up as thundering-herd traffic on every profile / leaderboard
 * page. Worth pinning.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the HTTP API layer BEFORE importing the store. We control
// resolved values per-test via vi.mocked(...) and count calls via
// .mock.calls.length.
vi.mock("@/lib/api", () => ({
  chat: {
    getRelationship:        vi.fn(),
    getRelationshipsBatch:  vi.fn(),
  },
}));

import { chat } from "@/lib/api";
import { useRelationshipStore } from "@/store/relationship-store";

const U1 = "user-1";
const U2 = "user-2";
const U3 = "user-3";

const sampleState = {
  self: false, friendship: "accepted", blocked: false, canMessage: true, friendshipId: "f1",
};

beforeEach(() => {
  // Reset the store to a clean slate between tests.
  useRelationshipStore.setState({ byUserId: {}, _inflight: {} });
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// fetch — single
// ════════════════════════════════════════════════════════════

describe("relationship-store: fetch", () => {
  it("fetches and caches on first call", async () => {
    chat.getRelationship.mockResolvedValueOnce({ data: sampleState });
    const state = await useRelationshipStore.getState().fetch(U1);
    expect(state).toEqual(sampleState);
    expect(useRelationshipStore.getState().byUserId[U1]).toEqual(sampleState);
    expect(chat.getRelationship).toHaveBeenCalledTimes(1);
  });

  it("returns cached value on second call without hitting the network", async () => {
    useRelationshipStore.setState({ byUserId: { [U1]: sampleState } });
    const state = await useRelationshipStore.getState().fetch(U1);
    expect(state).toEqual(sampleState);
    expect(chat.getRelationship).not.toHaveBeenCalled();
  });

  it("dedupes concurrent fetches — two calls during in-flight → one network request", async () => {
    let resolveIt;
    chat.getRelationship.mockReturnValueOnce(new Promise((r) => { resolveIt = r; }));

    const p1 = useRelationshipStore.getState().fetch(U1);
    const p2 = useRelationshipStore.getState().fetch(U1);

    // The SAME promise should be returned for both (dedupe).
    resolveIt({ data: sampleState });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual(sampleState);
    expect(r2).toEqual(sampleState);
    expect(chat.getRelationship).toHaveBeenCalledTimes(1);
  });

  it("force:true bypasses the cache", async () => {
    useRelationshipStore.setState({ byUserId: { [U1]: sampleState } });
    chat.getRelationship.mockResolvedValueOnce({ data: { ...sampleState, xp: 999 } });
    const state = await useRelationshipStore.getState().fetch(U1, { force: true });
    expect(state.xp).toBe(999);
    expect(chat.getRelationship).toHaveBeenCalledTimes(1);
  });

  it("empty/null userId returns null without fetching", async () => {
    const r1 = await useRelationshipStore.getState().fetch("");
    const r2 = await useRelationshipStore.getState().fetch(null);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(chat.getRelationship).not.toHaveBeenCalled();
  });

  it("clears in-flight entry on error so retry can happen", async () => {
    chat.getRelationship.mockRejectedValueOnce(new Error("boom"));
    await useRelationshipStore.getState().fetch(U1);
    expect(useRelationshipStore.getState()._inflight[U1]).toBeUndefined();
    // Second attempt can fire a new request.
    chat.getRelationship.mockResolvedValueOnce({ data: sampleState });
    const state = await useRelationshipStore.getState().fetch(U1);
    expect(state).toEqual(sampleState);
  });
});

// ════════════════════════════════════════════════════════════
// fetchBatch
// ════════════════════════════════════════════════════════════

describe("relationship-store: fetchBatch", () => {
  it("fetches only the ids not already cached", async () => {
    useRelationshipStore.setState({ byUserId: { [U1]: sampleState } });
    chat.getRelationshipsBatch.mockResolvedValueOnce({
      data: { [U2]: sampleState, [U3]: sampleState },
    });

    await useRelationshipStore.getState().fetchBatch([U1, U2, U3]);

    // Cached U1 should NOT be in the outbound request.
    expect(chat.getRelationshipsBatch).toHaveBeenCalledWith([U2, U3]);
  });

  it("dedupes duplicate ids in the input", async () => {
    chat.getRelationshipsBatch.mockResolvedValueOnce({ data: { [U1]: sampleState } });
    await useRelationshipStore.getState().fetchBatch([U1, U1, U1]);
    expect(chat.getRelationshipsBatch).toHaveBeenCalledWith([U1]);
  });

  it("empty list is a no-op", async () => {
    await useRelationshipStore.getState().fetchBatch([]);
    expect(chat.getRelationshipsBatch).not.toHaveBeenCalled();
  });

  it("chunks requests in batches of 100", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `u-${i}`);
    chat.getRelationshipsBatch.mockResolvedValue({ data: {} });
    await useRelationshipStore.getState().fetchBatch(ids);
    // 100 + 100 + 50 = 3 chunks
    expect(chat.getRelationshipsBatch).toHaveBeenCalledTimes(3);
  });

  it("populates the cache with returned entries", async () => {
    chat.getRelationshipsBatch.mockResolvedValueOnce({
      data: { [U1]: sampleState, [U2]: { ...sampleState, canMessage: false } },
    });
    await useRelationshipStore.getState().fetchBatch([U1, U2]);
    const { byUserId } = useRelationshipStore.getState();
    expect(byUserId[U1].canMessage).toBe(true);
    expect(byUserId[U2].canMessage).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// invalidate + reset
// ════════════════════════════════════════════════════════════

describe("relationship-store: invalidate", () => {
  it("invalidate(id) drops the cached entry", () => {
    useRelationshipStore.setState({ byUserId: { [U1]: sampleState } });
    useRelationshipStore.getState().invalidate(U1);
    expect(useRelationshipStore.getState().byUserId[U1]).toBeUndefined();
  });

  it("invalidate(id, updater) replaces the entry with the updater's return", () => {
    useRelationshipStore.setState({ byUserId: { [U1]: sampleState } });
    useRelationshipStore.getState().invalidate(U1, (prev) => ({
      ...prev, friendship: "pending_sent",
    }));
    expect(useRelationshipStore.getState().byUserId[U1].friendship).toBe("pending_sent");
  });

  it("invalidate(id, updater) that returns null drops the entry", () => {
    useRelationshipStore.setState({ byUserId: { [U1]: sampleState } });
    useRelationshipStore.getState().invalidate(U1, () => null);
    expect(useRelationshipStore.getState().byUserId[U1]).toBeUndefined();
  });

  it("reset() clears everything", () => {
    useRelationshipStore.setState({
      byUserId:  { [U1]: sampleState, [U2]: sampleState },
      _inflight: { [U3]: Promise.resolve(null) },
    });
    useRelationshipStore.getState().reset();
    const state = useRelationshipStore.getState();
    expect(state.byUserId).toEqual({});
    expect(state._inflight).toEqual({});
  });
});
