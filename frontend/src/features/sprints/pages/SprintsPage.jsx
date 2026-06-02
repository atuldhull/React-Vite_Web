/**
 * SprintsPage — /sprints
 *
 * Two-column layout on desktop, stacked on mobile:
 *   • Left:  Active sprint hero + window-scoped leaderboard
 *   • Right: Sprint archive list (last ~6 months)
 *
 * The leaderboard is server-computed per sprint window: writeups
 * posted during the window, scored by upvotes received during the
 * window. Ties broken by who-posted-first (the early-bird wins).
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Link, useSearchParams } from "react-router-dom";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import { sprints as sprintsApi } from "@/lib/api";

export default function SprintsPage() {
  const [params]                  = useSearchParams();
  const slugParam                  = params.get("slug") || null;

  const [archive,    setArchive]   = useState([]);
  const [board,      setBoard]     = useState(null);
  const [boardLoad,  setBoardLoad] = useState(true);
  const [archLoad,   setArchLoad]  = useState(true);
  const [error,      setError]     = useState(null);

  // Fetch archive once. Fast — capped to 26 rows server-side.
  useEffect(() => {
    const ctrl = new AbortController();
    sprintsApi
      .list({ signal: ctrl.signal })
      .then(({ data }) => setArchive(data.data || []))
      .catch((err) => {
        if (err?.code === "ERR_CANCELED") return;
        setError(err?.response?.data?.error || "Couldn't load sprints");
      })
      .finally(() => setArchLoad(false));
    return () => ctrl.abort();
  }, []);

  // Leaderboard for the selected sprint — defaults to active when
  // slug is unset.
  useEffect(() => {
    setBoardLoad(true);
    const ctrl = new AbortController();
    sprintsApi
      .leaderboard(slugParam, { signal: ctrl.signal })
      .then(({ data }) => setBoard(data))
      .catch((err) => {
        if (err?.code === "ERR_CANCELED") return;
        setError(err?.response?.data?.error || "Couldn't load leaderboard");
      })
      .finally(() => setBoardLoad(false));
    return () => ctrl.abort();
  }, [slugParam]);

  const focused = board?.sprint;
  const isActive = focused?.is_active;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-6xl py-10"
    >
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">Solution Sprints</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">
          One problem. One week. Many takes.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-text-muted">
          Every Monday a new problem from the catalogue takes the spotlight. Post a writeup
          during the window to land on this sprint's leaderboard — votes earned during the
          window are what counts.
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        {/* ── Hero + leaderboard ── */}
        <section className="space-y-6">
          {boardLoad ? (
            <Card variant="solid"><Loader variant="orbit" /></Card>
          ) : focused ? (
            <Card variant="glow">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-dim">
                    {isActive ? "Active sprint" : "Archived sprint"}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold text-white">{focused.title}</h2>
                </div>
                <div className="text-right font-mono text-[10px] text-text-dim">
                  <p>{fmtDate(focused.starts_at)} → {fmtDate(focused.ends_at)}</p>
                </div>
              </div>

              <LeaderboardList rows={board?.leaderboard || []} />
            </Card>
          ) : (
            <Card variant="solid">
              <p className="py-6 text-center text-sm text-text-dim">No sprint to show.</p>
            </Card>
          )}
        </section>

        {/* ── Archive ── */}
        <aside>
          <Card variant="solid">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">Past sprints</p>
            {archLoad ? (
              <p className="mt-4 text-xs text-text-dim">Loading…</p>
            ) : archive.length === 0 ? (
              <p className="mt-4 text-xs text-text-dim">No archived sprints yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {archive.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/sprints?slug=${encodeURIComponent(s.slug)}`}
                      className={
                        "block rounded-lg border px-3 py-2 transition " +
                        (slugParam === s.slug || (!slugParam && s.is_active)
                          ? "border-primary/30 bg-primary/12"
                          : "border-line/10 bg-white/[0.02] hover:border-primary/25")
                      }
                    >
                      <p className="truncate text-xs text-white">{s.title}</p>
                      {s.problem?.title && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-text-dim">
                          {s.problem.title}
                        </p>
                      )}
                      <p className="mt-0.5 font-mono text-[10px] text-text-dim">
                        {fmtDate(s.starts_at)} → {fmtDate(s.ends_at)}
                        {s.is_active && <span className="ml-2 text-primary">· live</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function LeaderboardList({ rows }) {
  const ranked = useMemo(() => rows.slice(0, 20), [rows]);
  if (!ranked.length) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-line/15 bg-white/[0.015] p-5 text-center text-xs text-text-dim">
        No writeups yet this sprint. Be the first to post one — top of the leaderboard is wide open.
      </div>
    );
  }
  return (
    <ol className="mt-4 space-y-2">
      {ranked.map((r, i) => (
        <li
          key={r.writeup_id}
          className="flex items-center gap-3 rounded-xl border border-line/10 bg-white/[0.025] p-3"
        >
          <RankBadge rank={i + 1} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{r.title}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-text-dim">
              {r.author_handle ? (
                <Link to={`/u/${r.author_handle}`} className="hover:text-primary">
                  {r.author_name}
                </Link>
              ) : (
                <span>{r.author_name}</span>
              )}
              <span className="ml-2">· posted {fmtDate(r.posted_at)}</span>
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[11px] text-white">
            ▲ {r.score}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RankBadge({ rank }) {
  const medal = rank === 1 ? "bg-amber-400/20 text-amber-300 border-amber-300/30"
              : rank === 2 ? "bg-slate-300/15 text-slate-200 border-slate-300/30"
              : rank === 3 ? "bg-orange-500/15 text-orange-300 border-orange-300/30"
              : "bg-white/[0.04] text-text-soft border-line/15";
  return (
    <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-sm " + medal}>
      {rank}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
