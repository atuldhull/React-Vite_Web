/**
 * SavedPage — /saved
 *
 * Single feed of everything the viewer has bookmarked across the
 * three target types (problems, writeups, roadmaps). Each row links
 * to the underlying entity and shows enough metadata that the
 * student remembers WHY they saved it. Filter tabs let them slice
 * by type when the feed grows long.
 *
 * The "unsave" button on each row pops the item out optimistically.
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { bookmarks as bookmarksApi } from "@/lib/api";
import Loader from "@/components/ui/Loader";

const TYPE_TABS = [
  { key: "",        label: "All" },
  { key: "problem", label: "Problems" },
  { key: "writeup", label: "Writeups" },
  { key: "roadmap", label: "Roadmaps" },
];

export default function SavedPage() {
  const [params, setParams] = useSearchParams();
  const filterType = params.get("type") || "";

  const [data,    setData]    = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    bookmarksApi.list(filterType ? { type: filterType } : {}, { signal: ctrl.signal })
      .then(({ data }) => {
        setData({ rows: data.data || [], total: data.total || 0 });
        setLoading(false);
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setError(err?.response?.data?.error || "Couldn't load your saved items");
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [filterType]);

  const onUnsave = useCallback(async (row) => {
    // Optimistic — strip it immediately, only roll back on failure.
    setData((d) => ({
      rows:  d.rows.filter((r) => !(r.target_type === row.target_type && r.target_id === row.target_id)),
      total: Math.max(0, d.total - 1),
    }));
    try {
      await bookmarksApi.toggle(row.target_type, row.target_id);
    } catch {
      // Rollback: re-insert at top. Order won't match server but the
      // feed has not been re-fetched so it's a close-enough recovery.
      setData((d) => ({ rows: [row, ...d.rows], total: d.total + 1 }));
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl pb-20 pt-8">
      <motion.header
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-dim">Personal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Saved
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-soft">
          Everything you've starred — problems to come back to, writeups worth re-reading, roadmaps you're tracking.
        </p>
      </motion.header>

      {/* Type tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        {TYPE_TABS.map((t) => {
          const active = filterType === t.key;
          return (
            <button
              key={t.key || "all"}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (t.key) next.set("type", t.key); else next.delete("type");
                setParams(next, { replace: true });
              }}
              className={
                "rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider transition " +
                (active
                  ? "border border-primary/40 bg-primary/15 text-white"
                  : "border border-line/20 bg-white/[0.04] text-text-soft hover:border-primary/40 hover:text-white")
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

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

      {!loading && !error && data.rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line/15 bg-white/[0.02] p-10 text-center">
          <p className="font-display text-lg text-white">No saved items yet.</p>
          <p className="mt-2 text-sm text-text-muted">
            Hit the ☆ on any problem, writeup, or roadmap to save it here.
          </p>
          <Link
            to="/problems"
            className="mt-4 inline-block rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-white hover:bg-primary/15"
          >
            Browse problems →
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {data.rows.map((row) => (
            <SavedRow key={`${row.target_type}:${row.target_id}`} row={row} onUnsave={() => onUnsave(row)} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function SavedRow({ row, onUnsave }) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-line/15 bg-white/[0.025] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <RowContent row={row} />
        <button
          type="button"
          onClick={onUnsave}
          className="shrink-0 rounded-lg border border-line/20 bg-white/[0.04] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-soft transition hover:border-warning/40 hover:text-warning"
        >
          ★ Unsave
        </button>
      </div>
    </motion.li>
  );
}

function RowContent({ row }) {
  if (!row.target) {
    return (
      <p className="text-sm text-text-dim italic">
        This {row.target_type} is no longer available.
      </p>
    );
  }

  if (row.target_type === "problem") {
    const p = row.target;
    return (
      <Link to={`/problems/${p.slug || p.id}`} className="block flex-1 group">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Problem · {p.source}
          </span>
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {p.difficulty}
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold text-white group-hover:text-primary transition">{p.title}</p>
        <p className="mt-1 font-mono text-[10px] text-text-dim">
          Saved {new Date(row.created_at).toLocaleDateString()}
        </p>
      </Link>
    );
  }

  if (row.target_type === "writeup") {
    const w = row.target;
    const parent = w.parent_problem;
    return (
      <Link to={parent ? `/problems/${parent.slug || parent.id}` : "#"} className="block flex-1 group">
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Writeup · ▲ {w.vote_count}
        </span>
        <p className="mt-2 text-sm font-semibold text-white group-hover:text-primary transition">{w.title}</p>
        {parent && (
          <p className="mt-1 font-mono text-[10px] text-text-dim">
            on <span className="text-text-soft">{parent.title}</span>
          </p>
        )}
      </Link>
    );
  }

  if (row.target_type === "roadmap") {
    const r = row.target;
    return (
      <Link to={`/roadmaps/${encodeURIComponent(r.slug)}`} className="block flex-1 group">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-lg">{r.cover_emoji || "🧭"}</span>
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Roadmap · {r.topic}
          </span>
        </div>
        <p className="mt-2 text-sm font-semibold text-white group-hover:text-primary transition">{r.title}</p>
        <p className="mt-1 text-xs text-text-soft line-clamp-2">{r.summary}</p>
      </Link>
    );
  }

  return null;
}
