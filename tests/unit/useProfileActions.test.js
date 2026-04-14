// @vitest-environment jsdom
/**
 * Unit tests for frontend/src/hooks/useProfileActions.js.
 *
 * Scope:
 *   - Each action hits the right API method with the right args
 *   - Each action updates the store correctly on success (optimistic)
 *   - startChat returns the conversation id
 *
 * The ACTIONS are the UX-critical surface — a send-request that
 * forgets to flip the button state to "pending_sent" would be a
 * visible stutter.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  chat: {
    sendRequest:             vi.fn(async () => ({ data: { ok: true } })),
    respondRequest:          vi.fn(async () => ({ data: { ok: true } })),
    cancelRequest:           vi.fn(async () => ({ data: { ok: true } })),
    unfriend:                vi.fn(async () => ({ data: { ok: true } })),
    getOrCreateConversation: vi.fn(async () => ({ data: { id: "conv-42" } })),
  },
}));

import { chat } from "@/lib/api";
import { useRelationshipStore } from "@/store/relationship-store";
import { useProfileActions } from "@/hooks/useProfileActions";

const TARGET = "target-user-id";

function resetStore() {
  useRelationshipStore.setState({ byUserId: {}, _inflight: {} });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════
// sendRequest
// ════════════════════════════════════════════════════════════

describe("useProfileActions.sendRequest", () => {
  it("calls chat.sendRequest with the target id", async () => {
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.sendRequest());
    expect(chat.sendRequest).toHaveBeenCalledWith(TARGET);
  });

  it("optimistically flips the store to pending_sent", async () => {
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.sendRequest());
    expect(useRelationshipStore.getState().byUserId[TARGET].friendship).toBe("pending_sent");
  });

  it("no-op when userId is empty", async () => {
    const { result } = renderHook(() => useProfileActions(""));
    await act(() => result.current.sendRequest());
    expect(chat.sendRequest).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// cancelRequest
// ════════════════════════════════════════════════════════════

describe("useProfileActions.cancelRequest", () => {
  it("calls the API + clears friendship in the store", async () => {
    useRelationshipStore.setState({
      byUserId: { [TARGET]: { self: false, friendship: "pending_sent", blocked: false, canMessage: false, friendshipId: null } },
    });
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.cancelRequest());
    expect(chat.cancelRequest).toHaveBeenCalledWith(TARGET);
    expect(useRelationshipStore.getState().byUserId[TARGET].friendship).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// acceptRequest / declineRequest
// ════════════════════════════════════════════════════════════

describe("useProfileActions.acceptRequest", () => {
  it("calls respondRequest with friendshipId + true", async () => {
    useRelationshipStore.setState({
      byUserId: { [TARGET]: { self: false, friendship: "pending_received", blocked: false, canMessage: false, friendshipId: "fr-1" } },
    });
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.acceptRequest());
    expect(chat.respondRequest).toHaveBeenCalledWith("fr-1", true);
    const next = useRelationshipStore.getState().byUserId[TARGET];
    expect(next.friendship).toBe("accepted");
    expect(next.canMessage).toBe(true);
  });

  it("no-op when there's no friendshipId in state (not a pending row)", async () => {
    useRelationshipStore.setState({
      byUserId: { [TARGET]: { self: false, friendship: null, blocked: false, canMessage: true, friendshipId: null } },
    });
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.acceptRequest());
    expect(chat.respondRequest).not.toHaveBeenCalled();
  });
});

describe("useProfileActions.declineRequest", () => {
  it("calls respondRequest with false + clears friendship in state", async () => {
    useRelationshipStore.setState({
      byUserId: { [TARGET]: { self: false, friendship: "pending_received", blocked: false, canMessage: false, friendshipId: "fr-1" } },
    });
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.declineRequest());
    expect(chat.respondRequest).toHaveBeenCalledWith("fr-1", false);
    expect(useRelationshipStore.getState().byUserId[TARGET].friendship).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════
// unfriend
// ════════════════════════════════════════════════════════════

describe("useProfileActions.unfriend", () => {
  it("calls the API with friendshipId + clears friendship state", async () => {
    useRelationshipStore.setState({
      byUserId: { [TARGET]: { self: false, friendship: "accepted", blocked: false, canMessage: true, friendshipId: "fr-1" } },
    });
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.unfriend());
    expect(chat.unfriend).toHaveBeenCalledWith("fr-1");
    const next = useRelationshipStore.getState().byUserId[TARGET];
    expect(next.friendship).toBeNull();
    expect(next.friendshipId).toBeNull();
  });

  it("no-op when no friendshipId is cached", async () => {
    useRelationshipStore.setState({
      byUserId: { [TARGET]: { self: false, friendship: null, blocked: false, canMessage: false, friendshipId: null } },
    });
    const { result } = renderHook(() => useProfileActions(TARGET));
    await act(() => result.current.unfriend());
    expect(chat.unfriend).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// startChat
// ════════════════════════════════════════════════════════════

describe("useProfileActions.startChat", () => {
  it("returns the conversation id from the API", async () => {
    const { result } = renderHook(() => useProfileActions(TARGET));
    let convId;
    await act(async () => { convId = await result.current.startChat(); });
    expect(chat.getOrCreateConversation).toHaveBeenCalledWith(TARGET);
    expect(convId).toBe("conv-42");
  });

  it("returns null when userId is empty (doesn't call the API)", async () => {
    const { result } = renderHook(() => useProfileActions(""));
    let convId;
    await act(async () => { convId = await result.current.startChat(); });
    expect(convId).toBeNull();
    expect(chat.getOrCreateConversation).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// Identity stability — callbacks shouldn't churn across renders
// with the same userId. This prevents useEffect thrashing in
// downstream components that subscribe to the actions.
// ════════════════════════════════════════════════════════════

describe("useProfileActions: callback stability", () => {
  it("returns stable callback identity for the same userId", () => {
    const { result, rerender } = renderHook(({ id }) => useProfileActions(id), {
      initialProps: { id: TARGET },
    });
    const first = result.current.sendRequest;
    rerender({ id: TARGET });
    const second = result.current.sendRequest;
    expect(first).toBe(second);
  });

  it("returns NEW callbacks when userId changes", () => {
    const { result, rerender } = renderHook(({ id }) => useProfileActions(id), {
      initialProps: { id: TARGET },
    });
    const first = result.current.sendRequest;
    rerender({ id: "different-user" });
    const second = result.current.sendRequest;
    expect(first).not.toBe(second);
  });
});
