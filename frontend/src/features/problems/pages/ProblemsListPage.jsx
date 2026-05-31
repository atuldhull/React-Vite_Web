/**
 * ProblemsListPage — browseable index of problem statements
 * (SIH / GSoC / Kaggle / MLH / Devfolio / Unstop / OpenSource).
 *
 * Auth-gated by the parent route's <ProtectedRoute>. Anyone with a
 * student / teacher / admin session sees the same catalogue.
 *
 * Filters (server-side):
 *   q          free-text title + description search
 *   source     SIH | GSoC | Kaggle | MLH | Devfolio | Unstop | OpenSource
 *   domain     AI/ML | Govt | Web | Web3 | IoT | OpenSource | ...
 *   difficulty beginner | intermediate | advanced
 *   tag        repeatable; AND of tags
 *
 * UX choices
 *   - Cards (not table) so each problem feels like a project you'd
 *     pick up, not a row to triage.
 *   - Filters live in a sticky sidebar on desktop, collapse to a
 *     drawer on mobile. The URL holds the filter state so a student
 *     can deep-link "AI/ML beginner problems from Kaggle" to a friend.
 *   - Pagination not infinite-scroll — students searching for a
 *     specific problem need a stable address bar.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { problems, bookmarks as bookmarksApi } from "@/lib/api";
import Loader from "@/components/ui/Loader";
import BookmarkButton from "@/components/ui/BookmarkButton";

const SOURCE_COLOR = {
  SIH:        { bg: "rgba(249, 115, 22, 0.10)", border: "rgba(249, 115, 22, 0.35)", text: "#fdba74" },
  GSoC:       { bg: "rgba(16, 185, 129, 0.10)", border: "rgba(16, 185, 129, 0.35)", text: "#6ee7b7" },
  Kaggle:     { bg: "rgba(59, 130, 246, 0.10)", border: "rgba(59, 130, 246, 0.35)", text: "#93c5fd" },
  MLH:        { bg: "rgba(236, 72, 153, 0.10)", border: "rgba(236, 72, 153, 0.35)", text: "#f9a8d4" },
  Devfolio:   { bg: "rgba(168, 85, 247, 0.10)", border: "rgba(168, 85, 247, 0.35)", text: "#d8b4fe" },
  Unstop:     { bg: "rgba(245, 158, 11, 0.10)", border: "rgba(245, 158, 11, 0.35)", text: "#fcd34d" },
  OpenSource: { bg: "rgba(148, 163, 184, 0.10)", border: "rgba(148, 163, 184, 0.35)", text: "#cbd5e1" },
};

const DIFFICULTY_COLOR = {
  beginner:     "#6ee7b7",
  intermediate: "#fcd34d",
  advanced:     "#fca5a5",
};

const PAGE_SIZE = 24;

export default function ProblemsListPage() {
  const [params, setParams] = useSearchParams();
  const [state,  setState]  = useState({ data: [], total: 0, loading: true, error: null });
  const [facets, setFacets] = useState({ domains: [], sources: [], tags: [] });
  // Bookmark state for the currently-loaded page of problems. Keyed
  // by problem id → boolean. Populated by a single batch call after
  // the page lands so each card knows its initial saved state
  // without N+1 round trips.
  const [savedMap, setSavedMap] = useState({});

  // Derived filter values from URL — single source of truth so
  // back/forward + deep-links work for free.
  const q          = params.get("q")          || "";
  const source     = params.get("source")     || "";
  const domain     = params.get("domain")     || "";
  const difficulty = params.get("difficulty") || "";
  const page       = Math.max(1, Number(params.get("page")) || 1);

  // Load facets once. Doesn't change as filters change — it's the
  // FULL set of options across every active problem, so the
  // dropdowns don't shrink when the user narrows their search.
  useEffect(() => {
    let cancelled = false;
    problems.facets().then(({ data }) => {
      if (!cancelled) setFacets(data);
    }).catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, []);

  // Re-fetch results whenever a filter changes. AbortController so
  // a rapid filter change doesn't race the previous fetch.
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    setSavedMap({});  // clear stale stars while the new page loads
    problems
      .list({ q, source, domain, difficulty, page, limit: PAGE_SIZE }, { signal: ctrl.signal })
      .then(({ data }) => {
        setState({ data: data.data, total: data.total, loading: false, error: null });
        // Bulk-fetch bookmark state for the visible page in the
        // background — the page renders without waiting for it.
        const ids = (data.data || []).map((p) => p.id);
        if (ids.length) {
          bookmarksApi.state("problem", ids, { signal: ctrl.signal })
            .then(({ data: map }) => setSavedMap(map || {}))
            .catch(() => { /* non-fatal — stars stay un-pre-filled */ });
        }
      })
      .catch((err) => {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
        setState({ data: [], total: 0, loading: false, error: err?.response?.data?.error || "Failed to load problems" });
      });
    return () => ctrl.abort();
  }, [q, source, domain, difficulty, page]);

  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));

  // Update a single filter slot. Resetting `page` to 1 on any
  // filter change is the expected behaviour (a deeper page would
  // probably be out-of-range for the narrower result set).
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: false });
  };

  const clearAll = () => setParams(new URLSearchParams(), { replace: false });
  const hasFilters = q || source || domain || difficulty;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-8">
      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-dim">PROBLEM REPOSITORY</p>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Real-world problems to actually build.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Hand-curated catalogue of problem statements from SIH, GSoC, Kaggle, MLH and
            the open-source world. Each one has the official source, datasets if any, and
            a short "how to start" so you don't stare at a blank file.
          </p>
        </div>
        <Link
          to="/problems/submit"
          className="rounded-lg border border-primary/40 bg-primary/15 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white transition hover:bg-primary/20"
        >
          + Submit problem
        </Link>
      </motion.header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px,1fr]">
        {/* ── Sidebar (sticky on desktop) ── */}
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <SearchBox value={q} onChange={(v) => setFilter("q", v)} />
          <FilterGroup
            label="Source"
            value={source}
            onChange={(v) => setFilter("source", v)}
            options={facets.sources}
          />
          <FilterGroup
            label="Domain"
            value={domain}
            onChange={(v) => setFilter("domain", v)}
            options={facets.domains}
          />
          <FilterGroup
            label="Difficulty"
            value={difficulty}
            onChange={(v) => setFilter("difficulty", v)}
            options={["beginner", "intermediate", "advanced"]}
          />
          {hasFilters && (
            <button
              onClick={clearAll}
              className="w-full rounded-lg border border-line/20 bg-white/[0.03] px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-muted transition hover:border-primary/40 hover:text-white"
            >
              clear filters
            </button>
          )}
        </aside>

        {/* ── Results ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-dim">
              {state.loading
                ? "loading…"
                : `${state.total.toLocaleString()} problem${state.total === 1 ? "" : "s"}`}
            </p>
          </div>

          {state.loading && (
            <div className="flex justify-center py-20">
              <Loader variant="orbit" />
            </div>
          )}

          {state.error && !state.loading && (
            <div className="rounded-2xl border border-danger/30 bg-danger/8 p-6 text-sm text-danger">
              {state.error}
            </div>
          )}

          {!state.loading && !state.error && state.data.length === 0 && (
            <div className="rounded-2xl border border-line/15 bg-surface/40 p-10 text-center">
              <p className="font-display text-lg text-white">No problems match these filters.</p>
              <p className="mt-2 text-sm text-text-muted">Try clearing one of them.</p>
            </div>
          )}

          {!state.loading && state.data.length > 0 && (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {state.data.map((p, i) => (
                <ProblemCard key={p.id} p={p} index={i} saved={Boolean(savedMap[p.id])} />
              ))}
            </ul>
          )}

          {/* Pagination */}
          {!state.loading && totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={(n) => setFilter("page", String(n))} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function SearchBox({ value, onChange }) {
  // Debounce so every keystroke doesn't fire a fetch — 250ms matches
  // the perceptual "I'm done typing" window for English speakers.
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 250);
    return () => clearTimeout(t);
  }, [local, value, onChange]);

  return (
    <div>
      <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">Search</label>
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="theorem, OCR, blockchain…"
        className="w-full rounded-lg border border-line/20 bg-panel/70 px-3 py-2 text-sm text-white outline-none transition focus:border-primary/40"
      />
    </div>
  );
}

function FilterGroup({ label, value, onChange, options }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">{label}</p>
      <div className="flex flex-col gap-1">
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(active ? "" : opt)}
              className={`rounded-md px-2.5 py-1.5 text-left text-xs transition ${
                active
                  ? "bg-primary/15 text-white ring-1 ring-primary/40"
                  : "text-text-muted hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProblemCard({ p, index, saved }) {
  const colors = SOURCE_COLOR[p.source] || SOURCE_COLOR.OpenSource;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className="relative"
    >
      {/* Bookmark sits OUTSIDE the <Link> so a click on it doesn't
          navigate. Absolutely positioned over the card's top-right. */}
      <div className="absolute right-3 top-3 z-10">
        <BookmarkButton type="problem" id={p.id} initial={saved} compact />
      </div>

      <Link
        to={`/problems/${p.slug || p.id}`}
        className="flex h-full flex-col rounded-2xl border border-line/15 bg-surface/60 p-5 shadow-panel transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
      >
        <div className="mb-3 flex items-center gap-2 pr-9">
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
            style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
          >
            {p.source}{p.source_event ? ` · ${p.source_event.replace(p.source + " ", "")}` : ""}
          </span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
            style={{ color: DIFFICULTY_COLOR[p.difficulty], border: `1px solid ${DIFFICULTY_COLOR[p.difficulty]}33` }}
          >
            {p.difficulty}
          </span>
        </div>

        <h3 className="font-display text-base font-semibold leading-snug text-white">{p.title}</h3>

        {p.organisation && (
          <p className="mt-2 text-xs text-text-muted">{p.organisation}</p>
        )}

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap gap-1.5">
            {(p.tags || []).slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] text-text-dim">
                #{t}
              </span>
            ))}
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

function Pagination({ page, totalPages, onChange }) {
  // 7-window pagination — first, last, current, current ±2,
  // ellipses for gaps. Keeps the pager visually consistent at any
  // page count.
  const window = useMemo(() => {
    const pages = new Set([1, totalPages, page, page - 1, page + 1, page - 2, page + 2]);
    return [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <nav className="mt-8 flex items-center justify-center gap-1 font-mono text-xs">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-md border border-line/20 bg-white/[0.03] px-3 py-1.5 text-text-muted transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        ←
      </button>
      {window.map((n, i) => {
        const gap = i > 0 && n - window[i - 1] > 1;
        return (
          <span key={n} className="flex items-center gap-1">
            {gap && <span className="px-1 text-text-dim">…</span>}
            <button
              onClick={() => onChange(n)}
              className={`rounded-md px-3 py-1.5 transition ${
                n === page
                  ? "bg-primary/20 text-white ring-1 ring-primary/40"
                  : "border border-line/20 bg-white/[0.03] text-text-muted hover:text-white"
              }`}
            >
              {n}
            </button>
          </span>
        );
      })}
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-md border border-line/20 bg-white/[0.03] px-3 py-1.5 text-text-muted transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        →
      </button>
    </nav>
  );
}
