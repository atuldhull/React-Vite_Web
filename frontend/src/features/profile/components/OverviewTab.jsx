/**
 * OverviewTab — landing tab on the rich profile.
 *
 * Shows two sections side-by-side on desktop, stacked on mobile:
 *   1. Mutual friends strip (via MutualFriendsStrip + users.mutualFriends)
 *   2. Recent activity preview (top 5 items via users.activity)
 *
 * This tab deliberately stays LIGHT — full timeline lives in the
 * Activity tab, full friend list in the Friends tab. Overview's
 * job is "give me the gist in one scroll".
 *
 * Empty states are silent: no mutual friends + no activity = the
 * tab just shows a small hint. No big "nothing to show" card —
 * that would make new users feel like there's a problem.
 */

import { useEffect, useState } from "react";
import { users } from "@/lib/api";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import MutualFriendsStrip from "@/components/social/MutualFriendsStrip";
import ActivityTimelineItem from "@/components/social/ActivityTimelineItem";

/**
 * @param {{
 *   userId: string,
 *   access: { isSelf: boolean, canViewActivityFeed: boolean },
 * }} props
 */
export default function OverviewTab({ userId, access }) {
  const [mutual,   setMutual]   = useState({ mutual: [], count: 0 });
  const [activity, setActivity] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);

    // Fire both requests in parallel. If activity is gated by
    // show_activity_feed=false (non-self), the backend returns
    // `hiddenByUser:true` with an empty items array — no extra
    // handling needed here.
    Promise.all([
      users.mutualFriends(userId).catch(() => ({ data: { mutual: [], count: 0 } })),
      users.activity(userId, 1, 5).catch(() => ({ data: { items: [] } })),
    ]).then(([mRes, aRes]) => {
      if (cancelled) return;
      setMutual(mRes.data || { mutual: [], count: 0 });
      setActivity(aRes.data?.items || []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Loader variant="dots" size="sm" />
      </div>
    );
  }

  const showsMutual  = !access.isSelf && mutual.count > 0;
  const showsActivity = activity.length > 0;

  if (!showsMutual && !showsActivity) {
    return (
      <Card variant="glass" className="py-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-dim">
          Nothing to show here yet
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Mutual friends */}
      {showsMutual && (
        <Card variant="glass">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-secondary">
            Mutual friends
          </p>
          <MutualFriendsStrip mutual={mutual.mutual} count={mutual.count} max={6} />
        </Card>
      )}

      {/* Recent activity — always full-width on desktop if mutual is absent */}
      {showsActivity && (
        <Card
          variant="glass"
          className={showsMutual ? "" : "md:col-span-2"}
        >
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-primary">
            Recent activity
          </p>
          <div className="divide-y divide-line/10">
            {activity.map((item, i) => (
              <ActivityTimelineItem key={`${item.kind}-${i}`} item={item} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
