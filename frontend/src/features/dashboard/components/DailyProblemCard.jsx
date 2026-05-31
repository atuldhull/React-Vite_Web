/**
 * DailyProblemCard — dashboard sidebar widget.
 *
 * Surfaces a single rotating problem (same for everyone globally) and
 * the viewer's check-in streak. The check-in is intentionally low-
 * pressure: clicking "I checked it out" bumps the streak. It doesn't
 * require finishing the problem — the daily rhythm is what we want
 * to reward, not the solve itself.
 *
 * Streak math lives in the backend (problemController.dailyCheckin).
 * The widget just calls /api/problems/daily once on mount, then
 * /api/problems/daily/checkin when the user clicks the streak button.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { problems } from "@/lib/api";

export default function DailyProblemCard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    problems.daily({ signal: ctrl.signal })
      .then(({ data }) => { setData(data); setLoading(false); })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setError(err?.response?.data?.error || "Couldn't load today's problem");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  async function onCheckin() {
    if (busy || !data || data.checked_in_today) return;
    setBusy(true);
    try {
      const { data: resp } = await problems.dailyCheckin();
      setData((d) => ({
        ...d,
        streak_days:      resp.streak_days,
        streak_last_date: resp.streak_last_date,
        checked_in_today: true,
      }));
    } catch {
      // best-effort — leave state alone, the user can retry
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <CardShell><div className="h-24 animate-pulse rounded-lg bg-white/[0.03]" /></CardShell>;
  }

  if (error || !data?.problem) {
    return null; // hide quietly — don't blow up the dashboard
  }

  const p = data.problem;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <CardShell>
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">Problem of the day</p>
          <StreakBadge days={data.streak_days} />
        </div>

        <Link to={`/problems/${encodeURIComponent(p.slug || p.id)}`} className="mt-4 block group">
          <p className="text-base font-semibold text-white group-hover:text-primary transition" style={{ textWrap: "balance" }}>
            {p.title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {p.source}
            </span>
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {p.difficulty}
            </span>
            <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {p.domain}
            </span>
          </div>
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCheckin}
            disabled={busy || data.checked_in_today}
            className={
              "rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition " +
              (data.checked_in_today
                ? "border border-success/40 bg-success/10 text-success cursor-default"
                : "border border-warning/40 bg-warning/12 text-white hover:bg-warning/20")
            }
          >
            {data.checked_in_today ? "✓ Checked in today" : "+1 to streak"}
          </button>
          <Link
            to={`/problems/${encodeURIComponent(p.slug || p.id)}`}
            className="font-mono text-[10px] uppercase tracking-wider text-primary hover:text-secondary"
          >
            Open problem →
          </Link>
        </div>
      </CardShell>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function CardShell({ children }) {
  return (
    <div className="rounded-2xl border border-warning/25 bg-gradient-to-br from-warning/[0.05] to-bg/40 p-5">
      {children}
    </div>
  );
}

function StreakBadge({ days }) {
  if (!days || days < 1) {
    return (
      <span className="font-mono text-[10px] text-text-dim">No streak yet</span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning"
      title={`Current daily streak: ${days} day${days === 1 ? "" : "s"}`}
    >
      🔥 {days}
    </span>
  );
}
