import { useState, useEffect } from "react";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import AchievementBadge from "@/components/ui/AchievementBadge";
import { achievements as achievementsApi } from "@/lib/api";

export default function AchievementsSection() {
  const [allAch, setAllAch] = useState([]);
  const [myAch, setMyAch] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([
      achievementsApi.list().catch(() => ({ data: [] })),
      achievementsApi.mine().catch(() => ({ data: [] })),
    ]).then(([all, mine]) => {
      setAllAch(Array.isArray(all.data) ? all.data : []);
      setMyAch(Array.isArray(mine.data) ? mine.data : []);
      setLoading(false);
    });
  }, []);

  const unlockedIds = new Set(myAch.map(u => u.achievement_id));
  const unlockedCount = unlockedIds.size;
  const totalCount = allAch.length;
  const display = showAll ? allAch : allAch.slice(0, 6);

  return (
    <Card variant="glass">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
          Achievements
        </p>
        <span className="math-text text-xs text-text-dim">{unlockedCount}/{totalCount}</span>
      </div>
      {loading ? (
        <div className="mt-4 flex justify-center"><Loader variant="dots" size="sm" /></div>
      ) : allAch.length === 0 ? (
        <p className="mt-3 text-xs text-text-dim">No achievements available yet</p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {display.map(ach => (
              <AchievementBadge
                key={ach.id}
                achievement={ach}
                unlocked={unlockedIds.has(ach.id)}
                compact
              />
            ))}
          </div>
          {totalCount > 6 && (
            <button onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full text-center font-mono text-[10px] text-primary/60 hover:text-primary transition">
              {showAll ? "Show less" : `Show all ${totalCount} achievements`}
            </button>
          )}
        </>
      )}
    </Card>
  );
}
