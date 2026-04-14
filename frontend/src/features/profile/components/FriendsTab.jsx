/**
 * FriendsTab — paginated list of the target user's friends.
 *
 * Data: GET /api/users/:id/friends (Phase 3 endpoint). Each row
 * carries `isMutual: true` when the viewer is also friends with
 * that person — we badge those rows to help the viewer recognise
 * shared connections.
 *
 * Pagination: offset/limit; "Load more" button appends to the list.
 * Client-side name search filters WITHIN loaded pages only (good
 * enough for club-scale friend lists; a server-side search can be
 * added later if needed).
 *
 * Privacy: the backend returns `hiddenByUser: true` when the target
 * has show_friend_list=false. We render a "This user has hidden
 * their friends list" card in that case rather than silently empty.
 *
 * Self-actions: when viewing OWN profile (access.isSelf), each row
 * gets a small "Remove" button that fires the unfriend action.
 * Deliberately scoped to self-view — you can't unfriend someone
 * from their own profile page anyway (nobody would expect that UX).
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { users, chat } from "@/lib/api";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import Button from "@/components/ui/Button";
import { useRelationshipStore } from "@/store/relationship-store";

const PAGE_SIZE = 20;

/**
 * @param {{
 *   userId: string,
 *   access: { isSelf: boolean },
 * }} props
 */
export default function FriendsTab({ userId, access }) {
  const [friends, setFriends]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [hidden, setHidden]     = useState(false);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [removing, setRemoving] = useState(null);
  const invalidate = useRelationshipStore((s) => s.invalidate);

  const fetchPage = useCallback(async (p) => {
    try {
      const { data } = await users.friends(userId, p, PAGE_SIZE);
      setHidden(!!data.hiddenByUser);
      setTotal(data.total || 0);
      setFriends((prev) => p === 1 ? (data.friends || []) : [...prev, ...(data.friends || [])]);
    } catch {
      // Silent — keep whatever we had. A retry button could be
      // added but the parent's error boundary already catches
      // catastrophic failures.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setPage(1);
    fetchPage(1).finally(() => setLoading(false));
  }, [userId, fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    const next = page + 1;
    await fetchPage(next);
    setPage(next);
    setLoadingMore(false);
  };

  // Self-view only: unfriend from the profile row directly.
  const handleRemove = async (friend) => {
    if (!access.isSelf) return;
    if (!window.confirm(`Unfriend ${friend.name || "this user"}?`)) return;
    setRemoving(friend.id);
    try {
      // Need the friendshipId. We don't have it inline on this endpoint,
      // so ask the relationship store (which wraps the backend lookup
      // + cache). A just-in-time fetch is fine — nobody unfriends 100
      // people at once.
      let rel = useRelationshipStore.getState().byUserId[friend.id];
      if (!rel?.friendshipId) {
        rel = await useRelationshipStore.getState().fetch(friend.id);
      }
      if (rel?.friendshipId) {
        await chat.unfriend(rel.friendshipId);
        invalidate(friend.id, (prev) => ({
          self: prev?.self ?? false,
          friendship: null,
          blocked: prev?.blocked ?? false,
          canMessage: prev?.canMessage ?? false,
          friendshipId: null,
        }));
        setFriends((prev) => prev.filter((f) => f.id !== friend.id));
        setTotal((t) => Math.max(0, t - 1));
      }
    } catch {
      // Ignore; UI stays as-is on failure.
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center">
        <Loader variant="dots" size="sm" />
      </div>
    );
  }

  if (hidden) {
    return (
      <Card variant="glass" className="py-10 text-center">
        <p className="text-3xl">🔒</p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
          This user has hidden their friends list
        </p>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card variant="glass" className="py-10 text-center">
        <p className="text-3xl">🤝</p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
          No friends yet
        </p>
      </Card>
    );
  }

  // Client-side name filter against the currently-loaded pages.
  const q = search.trim().toLowerCase();
  const visible = q
    ? friends.filter((f) => (f.name || "").toLowerCase().includes(q))
    : friends;

  const hasMore = friends.length < total;

  return (
    <div className="space-y-3">
      {/* Search + count header */}
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search friends..."
          className="flex-1 rounded-xl border border-line/15 bg-panel/70 px-4 py-2 text-sm text-white outline-none transition focus:border-primary/30"
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-dim shrink-0">
          {total} {total === 1 ? "friend" : "friends"}
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-line/10 overflow-hidden rounded-xl border border-line/10 bg-panel/40">
        {visible.map((f) => (
          <div key={f.id} className="flex items-center gap-3 p-3 transition hover:bg-white/[0.02]">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
              style={{ backgroundColor: f.avatar_color || "rgba(255,255,255,0.06)" }}
              aria-hidden
            >
              {f.avatar_emoji || "👤"}
            </div>
            <Link to={`/profile/${f.id}`} className="min-w-0 flex-1 hover:underline">
              <p className="truncate text-sm font-semibold text-white">{f.name}</p>
              <p className="font-mono text-[10px] text-text-dim">
                {f.title || "member"}
                {f.isMutual && <span className="ml-2 rounded-full border border-secondary/25 bg-secondary/10 px-1.5 py-0.5 text-[9px] uppercase text-secondary">Mutual</span>}
              </p>
            </Link>
            {typeof f.xp === "number" && (
              <span className="math-text text-[11px] text-primary">{f.xp} XP</span>
            )}
            {access.isSelf && (
              <Button
                size="sm"
                variant="ghost"
                loading={removing === f.id}
                onClick={() => handleRemove(f)}
              >
                Remove
              </Button>
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="p-4 text-center font-mono text-[10px] text-text-dim">No matches</p>
        )}
      </div>

      {/* Load more */}
      {hasMore && !q && (
        <div className="flex justify-center pt-2">
          <Button size="sm" variant="secondary" loading={loadingMore} onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
