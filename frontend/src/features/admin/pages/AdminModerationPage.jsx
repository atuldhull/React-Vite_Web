/**
 * AdminModerationPage — /admin/moderation
 *
 * Two queues for admin/teacher moderation:
 *   1. Community roadmap submissions — Approve / Feature / Reject.
 *   2. Problem-statement submissions (drafted via AI assistant) —
 *      Approve into the catalogue / Reject.
 *
 * Single page, two tabs. The tab is URL-driven (?tab=...) so an
 * admin can deep-link straight to one queue from a notification.
 */

import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { roadmaps as roadmapsApi, problemSubmissions } from "@/lib/api";
import Loader from "@/components/ui/Loader";

const TABS = [
  { key: "roadmaps", label: "Roadmaps" },
  { key: "problems", label: "Problem submissions" },
];

export default function AdminModerationPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "roadmaps";

  return (
    <div>
      <motion.header
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-dim">Admin</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-white">Moderation</h1>
      </motion.header>

      <div className="mb-5 flex gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("tab", t.key);
                setParams(next, { replace: true });
              }}
              className={
                "rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider transition " +
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

      {tab === "roadmaps" && <RoadmapQueue />}
      {tab === "problems" && <ProblemQueue />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function RoadmapQueue() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(new Set());

  const load = useCallback(() => {
    setLoading(true);
    roadmapsApi.queue()
      .then(({ data }) => { setItems(data.data || []); setLoading(false); })
      .catch((err) => { setError(err?.response?.data?.error || "Couldn't load queue"); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const onApprove = useCallback(async (id, feature) => {
    if (busy.has(id)) return;
    setBusy((s) => new Set(s).add(id));
    try {
      await roadmapsApi.approve(id, feature);
      setItems((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      alert(err?.response?.data?.error || "Approve failed");
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [busy]);

  const onReject = useCallback(async (id) => {
    const reason = prompt("Why is this rejected? (visible to the author)");
    if (!reason) return;
    if (busy.has(id)) return;
    setBusy((s) => new Set(s).add(id));
    try {
      await roadmapsApi.reject(id, reason);
      setItems((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      alert(err?.response?.data?.error || "Reject failed");
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [busy]);

  if (loading) {
    return <div className="flex min-h-[30vh] items-center justify-center"><Loader variant="orbit" /></div>;
  }

  if (error) {
    return <div className="rounded-2xl border border-danger/30 bg-danger/8 p-4 text-sm text-danger">{error}</div>;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line/15 bg-white/[0.02] p-10 text-center text-sm text-text-dim">
        Nothing pending. Inbox zero. 🎉
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="rounded-2xl border border-warning/30 bg-warning/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                <span className="mr-2 text-lg">{r.cover_emoji || "🧭"}</span>
                {r.title}
              </p>
              <p className="mt-1 text-xs text-text-soft">{r.summary}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-dim">
                <span>{r.topic}</span>
                <span>· {r.difficulty}</span>
                {r.est_hours ? <span>· ~{r.est_hours}h</span> : null}
                {r.author && (
                  <span>
                    · by {r.author.handle ? (
                      <Link to={`/u/${r.author.handle}`} className="text-primary hover:underline">@{r.author.handle}</Link>
                    ) : (r.author.name || "anon")}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Link
                to={`/roadmaps/${encodeURIComponent(r.slug)}`}
                target="_blank"
                className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
              >
                Open ↗
              </Link>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onApprove(r.id, false)}
                  disabled={busy.has(r.id)}
                  className="rounded-lg border border-success/40 bg-success/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-success hover:bg-success/15 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onApprove(r.id, true)}
                  disabled={busy.has(r.id)}
                  className="rounded-lg border border-primary/40 bg-primary/15 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-white hover:bg-primary/20 disabled:opacity-50"
                >
                  Feature
                </button>
                <button
                  type="button"
                  onClick={() => onReject(r.id)}
                  disabled={busy.has(r.id)}
                  className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-danger hover:bg-danger/12 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────────────────────────────────────── */

function ProblemQueue() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(new Set());

  const load = useCallback(() => {
    setLoading(true);
    problemSubmissions.queue()
      .then(({ data }) => { setItems(data.data || []); setLoading(false); })
      .catch((err) => { setError(err?.response?.data?.error || "Couldn't load queue"); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const onApprove = useCallback(async (id) => {
    if (busy.has(id)) return;
    setBusy((s) => new Set(s).add(id));
    try {
      await problemSubmissions.approve(id);
      setItems((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      alert(err?.response?.data?.error || "Approve failed");
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [busy]);

  const onReject = useCallback(async (id) => {
    const reason = prompt("Why is this rejected? (visible to the submitter)");
    if (!reason) return;
    if (busy.has(id)) return;
    setBusy((s) => new Set(s).add(id));
    try {
      await problemSubmissions.reject(id, reason);
      setItems((rs) => rs.filter((r) => r.id !== id));
    } catch (err) {
      alert(err?.response?.data?.error || "Reject failed");
    } finally {
      setBusy((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [busy]);

  if (loading) return <div className="flex min-h-[30vh] items-center justify-center"><Loader variant="orbit" /></div>;
  if (error)   return <div className="rounded-2xl border border-danger/30 bg-danger/8 p-4 text-sm text-danger">{error}</div>;

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line/15 bg-white/[0.02] p-10 text-center text-sm text-text-dim">
        No pending problem submissions.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((row) => (
        <li key={row.id} className="rounded-2xl border border-warning/30 bg-warning/[0.04] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{row.title}</p>
              <p className="mt-1 text-xs text-text-soft line-clamp-3">{row.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-dim">
                <span>{row.source}</span>
                <span>· {row.difficulty}</span>
                <span>· {row.domain}</span>
                {row.submitter && (
                  <span>
                    · by {row.submitter.handle ? (
                      <Link to={`/u/${row.submitter.handle}`} className="text-primary hover:underline">@{row.submitter.handle}</Link>
                    ) : (row.submitter.name || "anon")}
                  </span>
                )}
              </div>
              {row.official_url && (
                <a href={row.official_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-mono text-[10px] text-primary hover:underline">
                  Source ↗ {row.official_url.replace(/^https?:\/\//, "").slice(0, 60)}
                </a>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => onApprove(row.id)}
                disabled={busy.has(row.id)}
                className="rounded-lg border border-success/40 bg-success/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-success hover:bg-success/15 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => onReject(row.id)}
                disabled={busy.has(row.id)}
                className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-danger hover:bg-danger/12 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
