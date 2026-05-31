/**
 * RoadmapsListPage — /roadmaps
 *
 * Curated, sequenced learning paths. Each card shows progress
 * (done/total), topic, difficulty, and the elevator-pitch summary.
 * Clicking a card → /roadmaps/:slug for the timeline.
 *
 * Visual hierarchy mirrors the problems catalogue: glass cards on a
 * scattered backdrop, monospace meta labels, primary colour reserved
 * for actionable elements.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { roadmaps as roadmapsApi } from "@/lib/api";
import Loader from "@/components/ui/Loader";

const DIFFICULTY_TINT = {
  beginner:     { border: "rgba(110, 231, 183, 0.35)", text: "#6ee7b7" },
  intermediate: { border: "rgba(252, 211, 77, 0.35)",  text: "#fcd34d" },
  advanced:     { border: "rgba(252, 165, 165, 0.4)",  text: "#fca5a5" },
};

export default function RoadmapsListPage() {
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    roadmapsApi.list({ signal: ctrl.signal })
      .then(({ data }) => { setList(data.data || []); setLoading(false); })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setError(err?.response?.data?.error || "Couldn't load roadmaps");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8">
      <motion.header
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-dim">Learning</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl"
            style={{ textWrap: "balance" }}>
          Roadmaps
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-text-soft">
          Sequenced paths from "I want to start" to "I shipped something defensible." Pick one,
          tick off steps as you go, share the progress.
        </p>
      </motion.header>

      {loading && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader variant="orbit" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-danger/30 bg-danger/8 p-6 text-sm text-danger">
          {error}
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line/15 bg-white/[0.02] p-8 text-center text-sm text-text-dim">
          No roadmaps yet. Check back soon.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((r, i) => (
          <RoadmapCard key={r.id} r={r} delay={i * 0.04} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function RoadmapCard({ r, delay }) {
  const pct = r.step_count > 0 ? Math.round((r.done_count / r.step_count) * 100) : 0;
  const diff = DIFFICULTY_TINT[r.difficulty] || DIFFICULTY_TINT.intermediate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={`/roadmaps/${encodeURIComponent(r.slug)}`}
        className="group block h-full rounded-2xl border border-line/15 bg-white/[0.025] p-5 transition hover:border-primary/40 hover:bg-white/[0.04]"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-3xl leading-none" aria-hidden="true">{r.cover_emoji || "🧭"}</span>
          <span
            className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            style={{ borderColor: diff.border, color: diff.text }}
          >
            {r.difficulty}
          </span>
        </div>

        <h3 className="mt-3 font-display text-lg font-semibold tracking-tight text-white group-hover:text-primary transition"
            style={{ textWrap: "balance" }}>
          {r.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-text-soft line-clamp-3">{r.summary}</p>

        <div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
          <span>{r.topic}</span>
          {r.est_hours ? <span>· ~{r.est_hours}h</span> : null}
        </div>

        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-text-dim">
            <span>{r.done_count} / {r.step_count} steps</span>
            <span>{pct}%</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
