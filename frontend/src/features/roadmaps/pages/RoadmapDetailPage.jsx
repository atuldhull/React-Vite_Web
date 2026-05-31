/**
 * RoadmapDetailPage — /roadmaps/:slug
 *
 * Vertical timeline of steps. Each step is either:
 *   • A problem reference (links into /problems/:slug for the deep dive)
 *   • A resource link (opens externally)
 *   • A free-form checkpoint
 *
 * Clicking the checkbox toggles per-step completion. The progress
 * bar at the top updates locally on every toggle; the backend
 * roadmap_progress row is created/deleted in the background.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { roadmaps as roadmapsApi } from "@/lib/api";
import Loader from "@/components/ui/Loader";

const DIFFICULTY_TINT = {
  beginner:     { border: "rgba(110, 231, 183, 0.35)", text: "#6ee7b7" },
  intermediate: { border: "rgba(252, 211, 77, 0.35)",  text: "#fcd34d" },
  advanced:     { border: "rgba(252, 165, 165, 0.4)",  text: "#fca5a5" },
};

export default function RoadmapDetailPage() {
  const { slug } = useParams();
  const [state, setState] = useState({ roadmap: null, loading: true, error: null });
  const [busy, setBusy] = useState(new Set()); // step ids in flight

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ roadmap: null, loading: true, error: null });
    roadmapsApi.get(slug, { signal: ctrl.signal })
      .then(({ data }) => setState({ roadmap: data, loading: false, error: null }))
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setState({
          roadmap: null, loading: false,
          error: err?.response?.status === 404 ? "not-found" : (err?.response?.data?.error || "Couldn't load roadmap"),
        });
      });
    return () => ctrl.abort();
  }, [slug]);

  const onToggle = useCallback(async (stepId) => {
    if (busy.has(stepId)) return;
    setBusy((s) => new Set(s).add(stepId));

    // Optimistic flip + recount.
    setState((st) => {
      if (!st.roadmap) return st;
      const steps = st.roadmap.steps.map((s) =>
        s.id === stepId ? { ...s, done: !s.done } : s,
      );
      const done_count = steps.filter((s) => s.done).length;
      return { ...st, roadmap: { ...st.roadmap, steps, done_count } };
    });

    try {
      await roadmapsApi.toggleStep(stepId);
    } catch {
      // Roll back
      setState((st) => {
        if (!st.roadmap) return st;
        const steps = st.roadmap.steps.map((s) =>
          s.id === stepId ? { ...s, done: !s.done } : s,
        );
        const done_count = steps.filter((s) => s.done).length;
        return { ...st, roadmap: { ...st.roadmap, steps, done_count } };
      });
    } finally {
      setBusy((s) => {
        const next = new Set(s);
        next.delete(stepId);
        return next;
      });
    }
  }, [busy]);

  if (state.loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader variant="orbit" /></div>;
  }

  if (state.error === "not-found") {
    return (
      <div className="mx-auto w-full max-w-2xl py-20 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-dim">404</p>
        <h1 className="font-display mt-2 text-2xl text-white">Roadmap not found.</h1>
        <Link
          to="/roadmaps"
          className="mt-6 inline-block rounded-lg border border-line/20 bg-white/[0.05] px-4 py-2 font-mono text-xs uppercase tracking-wider text-white hover:border-primary/40"
        >
          ← All roadmaps
        </Link>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="mx-auto w-full max-w-2xl py-20">
        <div className="rounded-2xl border border-danger/30 bg-danger/8 p-6 text-sm text-danger">
          {state.error}
        </div>
      </div>
    );
  }

  const r = state.roadmap;
  const diff = DIFFICULTY_TINT[r.difficulty] || DIFFICULTY_TINT.intermediate;
  const pct  = r.step_count > 0 ? Math.round((r.done_count / r.step_count) * 100) : 0;

  return (
    <article className="mx-auto w-full max-w-4xl pb-20 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/roadmaps"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim transition hover:text-white"
        >
          ← Roadmaps
        </Link>
        {r.is_owner && (
          <Link
            to={`/roadmaps/${encodeURIComponent(r.slug)}/edit`}
            className="rounded-lg border border-line/25 bg-white/[0.04] px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-text-soft transition hover:border-primary/40 hover:text-white"
          >
            Edit
          </Link>
        )}
      </div>

      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-start gap-4">
          <span className="text-5xl leading-none" aria-hidden="true">{r.cover_emoji || "🧭"}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {r.topic}
              </span>
              <span
                className="rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                style={{ borderColor: diff.border, color: diff.text }}
              >
                {r.difficulty}
              </span>
              {r.est_hours ? (
                <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  ~{r.est_hours}h
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl"
                style={{ textWrap: "balance" }}>
              {r.title}
            </h1>
            <p className="mt-3 text-sm leading-7 text-text-soft">{r.summary}</p>
            {r.author && (
              <p className="mt-3 font-mono text-[11px] text-text-dim">
                By {r.author.handle ? (
                  <Link to={`/u/${r.author.handle}`} className="text-primary hover:underline">@{r.author.handle}</Link>
                ) : <span className="text-text-soft">{r.author.name || "a student"}</span>}
                {r.submission_status !== "approved" && (
                  <span className="ml-2 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warning">
                    {r.submission_status}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6 rounded-2xl border border-line/15 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-text-dim">
            <span>Your progress</span>
            <span>{r.done_count} / {r.step_count} · {pct}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="h-full rounded-full bg-primary/70"
            />
          </div>
        </div>
      </motion.header>

      {/* ── Description ── */}
      {r.description && (
        <p className="mt-8 text-sm leading-7 text-text-soft">{r.description}</p>
      )}

      {/* ── Steps timeline ── */}
      <ol className="mt-8 space-y-3">
        {r.steps.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            index={i}
            onToggle={() => onToggle(step.id)}
            disabled={busy.has(step.id)}
          />
        ))}
      </ol>
    </article>
  );
}

/* ─────────────────────────────────────────────────────────── */

function StepRow({ step, index, onToggle, disabled }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={
        "rounded-2xl border p-4 transition " +
        (step.done
          ? "border-success/30 bg-success/[0.06]"
          : "border-line/15 bg-white/[0.025] hover:border-primary/30")
      }
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={step.done ? "Mark step incomplete" : "Mark step complete"}
          className={
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition " +
            (step.done
              ? "border-success bg-success text-bg"
              : "border-line/30 bg-white/[0.04] hover:border-primary/60")
          }
        >
          {step.done && <span className="font-mono text-xs">✓</span>}
        </button>

        <div className="min-w-0 flex-1">
          <p className={"text-sm font-semibold transition " + (step.done ? "text-text-soft line-through" : "text-white")}>
            <span className="mr-2 font-mono text-[10px] text-text-dim">{String(index + 1).padStart(2, "0")}</span>
            {step.title}
          </p>
          {step.description && (
            <p className="mt-1.5 text-sm leading-6 text-text-soft">{step.description}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {step.problem && (
              <Link
                to={`/problems/${encodeURIComponent(step.problem.slug || step.problem.id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white hover:bg-primary/15"
              >
                ↗ Problem · {step.problem.title.slice(0, 40)}{step.problem.title.length > 40 ? "…" : ""}
              </Link>
            )}
            {step.resource_url && (
              <a
                href={step.resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line/25 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-soft hover:border-primary/40 hover:text-white"
              >
                ↗ {step.resource_label || "Resource"}
              </a>
            )}
            {step.est_minutes ? (
              <span className="font-mono text-[10px] text-text-dim">~{step.est_minutes} min</span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.li>
  );
}
