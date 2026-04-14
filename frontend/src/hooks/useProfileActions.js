/**
 * useProfileActions — action callbacks for every friendship / chat
 * mutation the Phase-15 FriendButton + UserHoverCard need.
 *
 * Each callback:
 *   - Calls the right HTTP endpoint
 *   - Invalidates the relationship-store entry for this user
 *   - Returns the promise so the caller can show loading state
 *
 * The hook doesn't render anything and doesn't maintain its own
 * loading state — that's the caller's responsibility (button-scoped
 * rather than profile-scoped loading is the usual pattern). The
 * hook's one job is: "here are the 6 things you can do to a user,
 * and the store will stay in sync afterward".
 *
 * Usage:
 *   const actions = useProfileActions(targetUserId);
 *   await actions.sendRequest();
 *   await actions.acceptRequest();   // requires friendshipId in current state
 *   await actions.unfriend();        // same
 *
 * `startChat` is included here rather than in a separate chat-control
 * hook because it's *always* paired with the friendship state check
 * (canMessage comes from the same cached relationship).
 */

import { useCallback, useMemo } from "react";
import { chat as chatApi } from "@/lib/api";
import { useRelationshipStore } from "@/store/relationship-store";

/**
 * @param {string} userId — the TARGET user we're taking actions on
 */
export function useProfileActions(userId) {
  const invalidate = useRelationshipStore((s) => s.invalidate);

  const sendRequest = useCallback(async () => {
    if (!userId) return;
    await chatApi.sendRequest(userId);
    // Optimistic: we know the state is now "pending_sent" from my side.
    // Setting it in the store immediately beats a second round-trip.
    invalidate(userId, (prev) => ({
      self:         prev?.self ?? false,
      friendship:   "pending_sent",
      blocked:      prev?.blocked ?? false,
      canMessage:   prev?.canMessage ?? false,
      // friendshipId returned in the response isn't echoed here
      // because the backend's /friends/request returns the row but
      // we don't wire it through. A refetch on next hover reconciles.
      friendshipId: prev?.friendshipId ?? null,
    }));
  }, [userId, invalidate]);

  const cancelRequest = useCallback(async () => {
    if (!userId) return;
    await chatApi.cancelRequest(userId);
    invalidate(userId, (prev) => ({
      self: prev?.self ?? false,
      friendship: null,
      blocked: prev?.blocked ?? false,
      canMessage: prev?.canMessage ?? false,
      friendshipId: null,
    }));
  }, [userId, invalidate]);

  /**
   * Accept a pending REQUEST that the TARGET sent me.
   * We need the friendshipId from the cached state (the /friends/pending
   * endpoint gives us the id, which the store stores in friendshipId
   * for pending_received rows).
   */
  const acceptRequest = useCallback(async () => {
    if (!userId) return;
    const prev = useRelationshipStore.getState().byUserId[userId];
    if (!prev?.friendshipId) return; // nothing to accept
    await chatApi.respondRequest(prev.friendshipId, true);
    invalidate(userId, (p) => ({
      self:         p?.self ?? false,
      friendship:   "accepted",
      blocked:      p?.blocked ?? false,
      canMessage:   true,
      friendshipId: prev.friendshipId,
    }));
  }, [userId, invalidate]);

  /** Reject a pending request — deletes the friendship row. */
  const declineRequest = useCallback(async () => {
    if (!userId) return;
    const prev = useRelationshipStore.getState().byUserId[userId];
    if (!prev?.friendshipId) return;
    await chatApi.respondRequest(prev.friendshipId, false);
    invalidate(userId, (p) => ({
      self:         p?.self ?? false,
      friendship:   null,
      blocked:      p?.blocked ?? false,
      canMessage:   p?.canMessage ?? false,
      friendshipId: null,
    }));
  }, [userId, invalidate]);

  /** Remove an existing accepted friendship. */
  const unfriend = useCallback(async () => {
    if (!userId) return;
    const prev = useRelationshipStore.getState().byUserId[userId];
    if (!prev?.friendshipId) return;
    await chatApi.unfriend(prev.friendshipId);
    invalidate(userId, (p) => ({
      self:         p?.self ?? false,
      friendship:   null,
      blocked:      p?.blocked ?? false,
      canMessage:   p?.canMessage ?? false, // target may still allow DMs with 'everyone'
      friendshipId: null,
    }));
  }, [userId, invalidate]);

  /**
   * Open-or-create a conversation and return the conversation id.
   * Caller decides what to do with it (navigate to chat route,
   * open a slide-out panel, etc.) — we don't couple the hook to
   * a specific chat UI.
   */
  const startChat = useCallback(async () => {
    if (!userId) return null;
    const { data } = await chatApi.getOrCreateConversation(userId);
    return data?.id ?? null;
  }, [userId]);

  return useMemo(
    () => ({ sendRequest, cancelRequest, acceptRequest, declineRequest, unfriend, startChat }),
    [sendRequest, cancelRequest, acceptRequest, declineRequest, unfriend, startChat],
  );
}
