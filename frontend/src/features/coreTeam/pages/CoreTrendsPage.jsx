import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { core } from "@/lib/api";
import { useCoreStore } from "@/store/core-store";

const CAT_GRAD = {
  Maths:          "from-violet-500/30 to-indigo-500/10",
  Marketing:      "from-amber-500/30 to-orange-500/10",
  "Social Media": "from-cyan-500/30 to-sky-500/10",
  Design:         "from-pink-500/30 to-rose-500/10",
  Technology:     "from-emerald-500/30 to-teal-500/10",
  General:        "from-slate-500/30 to-slate-500/10",
};

function timeAgo(d) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CoreTrendsPage() {
  const { member } = useCoreStore();
  const isCouncil = member?.tier === "council";
  const [data, setData] = useState(null);
  const [category, setCategory] = useState("All");
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback((cat) => {
    core.trends(cat && cat !== "All" ? cat : undefined)
      .then((r) => setData(r.data || { trends: [], categories: [] }))
      .catch(() => setData({ trends: [], categories: [] }));
  }, []);

  useEffect(() => { load(category); }, [category, load]);

  const refresh = async () => {
    setRefreshing(true);
    setNote(null);
    try {
      const { data: r } = await core.refreshTrends();
      setNote(r.added ? `Pulled ${r.added} fresh item${r.added > 1 ? "s" : ""}.` : "Already up to date.");
      load(category);
    } catch {
      setNote("Refresh failed — try again later.");
    }
    setRefreshing(false);
    setTimeout(() => setNote(null), 5000);
  };

  if (!data) {
    return <div className="flex justify-center py-20"><Loader variant="orbit" size="lg" label="Loading trends…" /></div>;
  }

  const cats = ["All", ...data.categories];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                category === c ? "border-primary/40 bg-primary/12 text-white"
                               : "border-line/15 bg-white/[0.02] text-text-muted hover:text-white"
              }`}>
              {c}
            </button>
          ))}
        </div>
        {isCouncil && (
          <Button size="sm" variant="secondary" magnetic={false} loading={refreshing} onClick={refresh}>
            ↻ Refresh feed
          </Button>
        )}
      </div>

      {note && (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">{note}</p>
      )}

      <p className="text-xs text-text-dim">
        Auto-refreshed every 4 hours from maths, marketing, social, design and tech sources — scan for things the club can run with.
      </p>

      {data.trends.length === 0 ? (
        <div className="rounded-2xl border border-line/15 bg-surface/40 py-16 text-center">
          <p className="text-sm text-text-dim">No trends loaded yet. The feed fills up within a few hours of launch.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.trends.map((t, i) => (
            <motion.a
              key={t.id}
              href={t.source_url}
              target="_blank"
              rel="noreferrer noopener"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.06, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-surface/60 shadow-panel backdrop-blur-xl"
            >
              {/* image / gradient header */}
              <div className={`relative h-40 w-full overflow-hidden bg-gradient-to-br ${CAT_GRAD[t.category] || CAT_GRAD.General}`}>
                {t.image_url && (
                  <img
                    src={t.image_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white backdrop-blur">
                  {t.category}
                </span>
              </div>

              {/* body */}
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-display text-base font-bold leading-snug text-white">{t.title}</h3>
                <p className="mt-2 line-clamp-3 flex-1 text-xs leading-6 text-text-muted">
                  {t.summary || `Latest from ${t.source_name}. Tap to read the full article.`}
                </p>
                <p className={`mt-3 rounded-lg border px-3 py-2 text-xs leading-6 ${
                  t.club_angle
                    ? "border-primary/20 bg-primary/8 text-primary"
                    : "border-line/15 bg-white/[0.04] text-text-muted"
                }`}>
                  💡 {t.club_angle || `Could spark a ${t.category.toLowerCase()} reel, post or event — open it for ideas.`}
                </p>
                <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-text-dim">
                  <span>{t.source_name}</span>
                  <span>{timeAgo(t.published_at || t.fetched_at)}</span>
                </div>
              </div>
            </motion.a>
          ))}
        </div>
      )}
    </div>
  );
}
