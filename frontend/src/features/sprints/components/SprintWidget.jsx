/**
 * SprintWidget — dashboard sidebar card surfacing the active sprint.
 *
 * Hits /sprints/active once on mount (lazy: many dashboard visits
 * happen in a single browser session so a per-mount fetch is fine
 * without caching). Renders the featured problem title, a countdown
 * to the sprint window's end, current writeup count, and a CTA
 * linking to the problem detail (where the engagement panel +
 * writeup composer live).
 *
 * Failure mode: the active-sprint endpoint can 503 if there are no
 * eligible problems to feature. We surface a quiet "Loading…" skeleton
 * and never show a destructive error — the sprint widget is a nudge,
 * not a critical surface.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "@/components/ui/Card";
import { sprints as sprintsApi } from "@/lib/api";

export default function SprintWidget() {
  const [sprint,    setSprint]    = useState(null);
  const [problem,   setProblem]   = useState(null);
  const [count,     setCount]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [hidden,    setHidden]    = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    sprintsApi
      .active({ signal: ctrl.signal })
      .then(({ data }) => {
        setSprint(data.sprint);
        setProblem(data.problem);
        setCount(data.writeup_count || 0);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED") return;
        // 503: no eligible problem. Hide quietly.
        if (err?.response?.status === 503) setHidden(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  // Re-render every minute so the countdown stays fresh while the
  // tab is open. Heavyweight intervals would burn battery; one
  // minute is plenty for a weekly window.
  useEffect(() => {
    if (!sprint) return;
    const id = setInterval(() => setTick((n) => n + 1), 60 * 1000);
    return () => clearInterval(id);
  }, [sprint]);

  if (hidden) return null;
  if (loading) {
    return (
      <Card variant="glow">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">Sprint</p>
        <p className="mt-4 text-xs text-text-dim">Loading this week's sprint…</p>
      </Card>
    );
  }
  if (!sprint || !problem) return null;

  return (
    <Card variant="glow">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">Sprint · this week</p>
        <Link to="/sprints" className="font-mono text-[10px] text-primary transition hover:text-secondary">
          View all
        </Link>
      </div>
      <div className="mt-4 rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
        <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Featured problem</p>
        <h3 className="mt-1 line-clamp-2 text-base font-semibold text-white">{problem.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-dim">
          {problem.source && (
            <span className="rounded-full border border-line/15 bg-white/[0.04] px-2 py-0.5 uppercase">
              {problem.source}
            </span>
          )}
          {problem.difficulty && (
            <span className="rounded-full border border-line/15 bg-white/[0.04] px-2 py-0.5 uppercase">
              {problem.difficulty}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span className="text-text-muted">
            {count} writeup{count === 1 ? "" : "s"} so far
          </span>
          <Countdown endsAt={sprint.ends_at} />
        </div>
        <Link
          to={`/problems/${problem.slug || problem.id}`}
          className="mt-3 block rounded-lg border border-primary/40 bg-primary/15 px-3 py-2 text-center font-mono text-[11px] uppercase tracking-wider text-white transition hover:bg-primary/25"
        >
          Join the sprint →
        </Link>
      </div>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Countdown({ endsAt }) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return <span className="font-mono text-[10px] text-text-dim">closing…</span>;
  const totalMins = Math.floor(ms / (60 * 1000));
  const days = Math.floor(totalMins / (24 * 60));
  const hours = Math.floor((totalMins % (24 * 60)) / 60);
  const mins = totalMins % 60;

  let label;
  if (days > 0) label = `${days}d ${hours}h left`;
  else if (hours > 0) label = `${hours}h ${mins}m left`;
  else label = `${mins}m left`;

  return <span className="font-mono text-[10px] text-primary">{label}</span>;
}
