/**
 * Relationship store (Phase 15).
 *
 * Caches the viewer↔target relationship state returned by
 * GET /api/chat/relationship/:id and POST /api/chat/relationships/batch.
 *
 * Why a dedicated store
 * ─────────────────────
 * The Phase-15 UI renders the same `{ self, friendship, blocked,
 * canMessage, friendshipId }` shape in three different places:
 *   - Rich profile page header (one id)
 *   - UserHoverCard that pops up on hover anywhere (one id)
 *   - Leaderboard rows + event registrant lists (N ids, batched)
 *
 * If each consumer hits the network independently, the same id gets
 * fetched 3–10× per page view. A shared cache + dedupe layer means:
 *
 *   - First component to ask for user X triggers a fetch; concurrent
 *     asks during that in-flight window wait for the same promise.
 *   - After resolve, everyone reads from state → zero network for
 *     the rest of the page.
 *   - Mutation actions (send request, accept, unfriend) call
 *     `invalidate(id)` on success to force the next render to
 *     refetch — so a just-accepted friendship flips the button
 *     state everywhere without a page reload.
 *
 * Batch fetching
 * ──────────────
 * `fetchBatch(ids)` pre-warms the cache for list pages. Used on
 * leaderboard / event registrant mount so hovering any row in the
 * list renders the button state instantly without a network round-
 * trip.
 *
 * Memory / TTL
 * ────────────
 * No TTL. Relationship state is cheap to keep forever; a full page
 * reload evicts the store anyway. If a race causes stale state
 * (e.g. two tabs open, one accepts a friend request that the other
 * tab's cached state doesn't know about), the stale tab's next
 * attempt to send/respond will fail at the API layer with 404 or
 * 409 and the store will invalidate itself on error recovery.
 */

import { create } from "zustand";
import { chat as chatApi } from "@/lib/api";

/**
 * Shape of a cached relationship entry.
 * @typedef {{
 *   self: boolean,
 *   friendship: "pending_sent" | "pending_received" | "accepted" | null,
 *   blocked: false | "by_me" | "by_them",
 *   canMessage: boolean,
 *   friendshipId: string | null,
 * }} RelationshipState
 */

export const useRelationshipStore = create((set, get) => ({
  /** @type {Record<string, RelationshipState>} */
  byUserId: {},

  /**
   * In-flight single fetches, keyed by userId. A second `fetch(X)`
   * during the first's inflight window awaits the same promise
   * rather than issuing a duplicate request.
   * @type {Record<string, Promise<RelationshipState | null>>}
   */
  _inflight: {},

  /**
   * Fetch a single relationship, with dedupe. Returns the cached
   * value instantly when available.
   *
   * @param {string} userId
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<RelationshipState | null>}
   */
  fetch: async (userId, opts = {}) => {
    if (!userId) return null;
    const { byUserId, _inflight } = get();
    if (!opts.force && byUserId[userId]) return byUserId[userId];
    if (_inflight[userId])               return _inflight[userId];

    const promise = chatApi.getRelationship(userId)
      .then((r) => {
        const state = r.data;
        set((s) => ({
          byUserId: { ...s.byUserId, [userId]: state },
          _inflight: { ...s._inflight, [userId]: undefined },
        }));
        return state;
      })
      .catch(() => {
        // On error, clear the inflight entry so a retry can happen.
        // Don't cache the failure — the next caller will re-attempt.
        set((s) => {
          const next = { ...s._inflight };
          delete next[userId];
          return { _inflight: next };
        });
        return null;
      });

    set((s) => ({ _inflight: { ...s._inflight, [userId]: promise } }));
    return promise;
  },

  /**
   * Batch-fetch (up to 100 ids per call). De-duplicates against the
   * current cache — only the uncached ids are sent to the server.
   * Splits transparently if called with >100 ids.
   *
   * @param {string[]} userIds
   * @param {{ force?: boolean }} [opts]
   */
  fetchBatch: async (userIds, opts = {}) => {
    if (!userIds || userIds.length === 0) return;
    const { byUserId } = get();
    const unique = [...new Set(userIds.filter(Boolean))];
    const missing = opts.force ? unique : unique.filter((id) => !byUserId[id]);
    if (missing.length === 0) return;

    // The API caps at 100 per request — chunk to stay under.
    const chunks = [];
    for (let i = 0; i < missing.length; i += 100) {
      chunks.push(missing.slice(i, i + 100));
    }

    await Promise.all(chunks.map(async (chunk) => {
      try {
        const { data } = await chatApi.getRelationshipsBatch(chunk);
        set((s) => ({ byUserId: { ...s.byUserId, ...data } }));
      } catch {
        // Best-effort; a failure here shouldn't crash the list page.
        // Individual `fetch(id)` calls can still retry per-row.
      }
    }));
  },

  /**
   * Drop a specific user's cached entry. Call after a mutation
   * (send request, accept, unfriend) so the next consumer refetches
   * fresh state.
   *
   * Also optimistically updates in place if an `updater` is given —
   * avoids a network round-trip when the new state is already known
   * locally (e.g. after `respond` returns the accepted row).
   *
   * @param {string} userId
   * @param {(prev: RelationshipState | undefined) => RelationshipState | null} [updater]
   */
  invalidate: (userId, updater) => {
    if (!userId) return;
    set((s) => {
      const next = { ...s.byUserId };
      if (typeof updater === "function") {
        const updated = updater(next[userId]);
        if (updated) next[userId] = updated;
        else delete next[userId];
      } else {
        delete next[userId];
      }
      return { byUserId: next };
    });
  },

  /** Clear everything — e.g. on logout. */
  reset: () => set({ byUserId: {}, _inflight: {} }),
}));
