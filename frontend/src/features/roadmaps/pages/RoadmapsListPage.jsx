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

import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { roadmaps as roadmapsApi, bookmarks as bookmarksApi } from "@/lib/api";
import Loader from "@/components/ui/Loader";
import BookmarkButton from "@/components/ui/BookmarkButton";

const DIFFICULTY_TINT = {
  beginner:     { border: "rgba(110, 231, 183, 0.35)", text: "#6ee7b7" },
  intermediate: { border: "rgba(252, 211, 77, 0.35)",  text: "#fcd34d" },
  advanced:     { border: "rgba(252, 165, 165, 0.4)",  text: "#fca5a5" },
};

export default function RoadmapsListPage() {
  const navigate = useNavigate();
  const [list,     setList]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [savedMap, setSavedMap] = useState({}); // roadmap id → bool
  const [creating, setCreating] = useState(false);

  // Bucket the list into featured / community-approved / mine
  // (draft|pending|rejected). We do this client-side from one
  // payload because the controller returns all three in one call.
  const featured  = list.filter((r) => r.is_featured && r.submission_status === "approved");
  const community = list.filter((r) => !r.is_featured && r.submission_status === "approved");
  const mine      = list.filter((r) => r.submission_status !== "approved");

  const onCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      // Bootstrap a minimal draft and shunt the author into the editor.
      // Title + summary + topic are all required at the DB level; we
      // pre-fill placeholders the user will overwrite immediately.
      const { data } = await roadmapsApi.create({
        title:      "Untitled roadmap",
        summary:    "A new learning path — write a one-liner here.",
        topic:      "General",
        difficulty: "intermediate",
      });
      navigate(`/roadmaps/${encodeURIComponent(data.slug)}/edit`);
    } catch (err) {
      alert(err?.response?.data?.error || "Couldn't create roadmap");
    } finally {
      setCreating(false);
    }
  }, [creating, navigate]);

  useEffect(() => {
    const ctrl = new AbortController();
    roadmapsApi.list({}, { signal: ctrl.signal })
      .then(({ data }) => {
        const rows = data.data || [];
        setList(rows);
        setLoading(false);
        // Background fetch of bookmark state — non-fatal.
        const ids = rows.map((r) => r.id);
        if (ids.length) {
          bookmarksApi.state("roadmap", ids, { signal: ctrl.signal })
            .then(({ data: map }) => setSavedMap(map || {}))
            .catch(() => {});
        }
      })
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
        className="mb-8 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-dim">Learning</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              style={{ textWrap: "balance" }}>
            Roadmaps
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-text-soft">
            Sequenced paths from "I want to start" to "I shipped something defensible." Pick one,
            tick off steps as you go, share the progress.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white transition hover:bg-primary/20 disabled:opacity-50"
        >
          {creating ? "Creating…" : "+ Create roadmap"}
        </button>
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

      {/* Featured (admin-curated) */}
      {featured.length > 0 && (
        <Section title="Featured" subtitle="Hand-picked by Math Collective">
          <CardGrid items={featured} savedMap={savedMap} />
        </Section>
      )}

      {/* Community-approved */}
      {community.length > 0 && (
        <Section title="From the community" subtitle="Written and shared by other students">
          <CardGrid items={community} savedMap={savedMap} />
        </Section>
      )}

      {/* Your own work-in-progress / pending / rejected */}
      {mine.length > 0 && (
        <Section title="Your roadmaps" subtitle="Drafts, pending review, and rejected">
          <CardGrid items={mine} savedMap={savedMap} />
        </Section>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function Section({ title, subtitle, children }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-text-dim">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function CardGrid({ items, savedMap }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((r, i) => (
        <RoadmapCard key={r.id} r={r} delay={i * 0.04} saved={Boolean(savedMap[r.id])} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function RoadmapCard({ r, delay, saved }) {
  const pct = r.step_count > 0 ? Math.round((r.done_count / r.step_count) * 100) : 0;
  const diff = DIFFICULTY_TINT[r.difficulty] || DIFFICULTY_TINT.intermediate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      {/* Bookmark — absolutely positioned so the click doesn't
          bubble through to the Link. */}
      <div className="absolute right-3 top-3 z-10">
        <BookmarkButton type="roadmap" id={r.id} initial={saved} compact />
      </div>
      <Link
        to={`/roadmaps/${encodeURIComponent(r.slug)}`}
        className="group block h-full rounded-2xl border border-line/15 bg-white/[0.025] p-5 transition hover:border-primary/40 hover:bg-white/[0.04]"
      >
        <div className="flex items-start justify-between gap-2 pr-9">
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
