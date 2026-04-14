/**
 * ActivityTab — full paginated timeline of the target's activity.
 *
 * Data: GET /api/users/:id/activity (Phase 3 endpoint, pages of 20
 * merged event-registration + achievement-unlock rows, sorted DESC
 * by timestamp).
 *
 * Privacy: if the target has show_activity_feed=false (and the
 * viewer isn't self), the backend returns `hiddenByUser: true` and
 * we render the "This user has hidden their activity" card.
 *
 * Each row renders via the shared ActivityTimelineItem so the
 * Overview tab preview and this tab look consistent.
 */

import { useEffect, useState, useCallback } from "react";
import { users } from "@/lib/api";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import Button from "@/components/ui/Button";
import ActivityTimelineItem from "@/components/social/ActivityTimelineItem";

const PAGE_SIZE = 20;

/**
 * @param {{ userId: string }} props
 */
export default function ActivityTab({ userId }) {
  const [items, setItems]         = useState([]);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]     = useState(false);
  const [hidden, setHidden]       = useState(false);

  const fetchPage = useCallback(async (p) => {
    try {
      const { data } = await users.activity(userId, p, PAGE_SIZE);
      setHidden(!!data.hiddenByUser);
      setHasMore(!!data.hasMore);
      setItems((prev) => p === 1 ? (data.items || []) : [...prev, ...(data.items || [])]);
    } catch {
      // Silent — keep prior state.
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
          This user has hidden their activity
        </p>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card variant="glass" className="py-10 text-center">
        <p className="text-3xl">🌱</p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
          No activity yet
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card variant="glass">
        <div className="divide-y divide-line/10">
          {items.map((item, i) => (
            <ActivityTimelineItem key={`${item.kind}-${i}-${item.at}`} item={item} />
          ))}
        </div>
      </Card>
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button size="sm" variant="secondary" loading={loadingMore} onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
