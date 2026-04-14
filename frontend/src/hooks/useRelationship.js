/**
 * useRelationship — read a cached relationship state for a target
 * user, auto-fetching on first mount if the store doesn't already
 * have it.
 *
 * Usage:
 *   const { state, loading, refetch } = useRelationship(userId);
 *
 *   if (loading) return <Skeleton />;
 *   if (state?.self) return null;              // hide buttons on self
 *   if (state?.friendship === "accepted") ...
 *
 * Shape
 * ─────
 *   state    — the cached RelationshipState (see relationship-store.js)
 *              or null if the user is the viewer / id is empty / the
 *              fetch failed.
 *   loading  — true while the first fetch for this userId is in-flight
 *              AND nothing is cached yet. Cached reads NEVER set
 *              loading=true.
 *   refetch  — force a fresh network call (e.g. after an external
 *              mutation like the chat panel sending a request).
 *
 * The hook is intentionally lightweight — the store handles dedupe,
 * cache, invalidation; this is just the React subscription layer.
 */

import { useEffect, useState, useCallback } from "react";
import { useRelationshipStore } from "@/store/relationship-store";

/** @param {string | null | undefined} userId */
export function useRelationship(userId) {
  const state = useRelationshipStore((s) => (userId ? s.byUserId[userId] : null));
  const fetch = useRelationshipStore((s) => s.fetch);
  const inflight = useRelationshipStore((s) => (userId ? s._inflight[userId] : null));
  const [, forceRender] = useState(0);

  // Trigger fetch on first mount (or when userId changes) if we
  // don't have cached state and no fetch is already underway.
  useEffect(() => {
    if (!userId) return;
    if (state)    return;
    if (inflight) return;
    fetch(userId).finally(() => forceRender((n) => n + 1));
  }, [userId, state, inflight, fetch]);

  const refetch = useCallback(() => {
    if (!userId) return Promise.resolve(null);
    return fetch(userId, { force: true });
  }, [userId, fetch]);

  return {
    state,
    loading: !state && !!inflight,
    refetch,
  };
}
