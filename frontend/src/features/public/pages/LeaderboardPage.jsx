import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import MonumentHero from "@/components/monument/MonumentHero";
import { useMonument } from "@/hooks/useMonument";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Loader from "@/components/ui/Loader";
import { leaderboard, events as eventsApi } from "@/lib/api";


export default function LeaderboardPage() {
  useMonument("glacier");
  const [tab, setTab] = useState("weekly");
  const [weekly, setWeekly] = useState([]);
  const [allTime, setAllTime] = useState([]);
  const [winners, setWinners] = useState([]);
  const [weekInfo, setWeekInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Event leaderboard state
  const [competitionEvents, setCompetitionEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventLb, setEventLb] = useState([]);
  const [eventLbLoading, setEventLbLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      leaderboard.weekly().catch(() => ({ data: [] })),
      leaderboard.allTime().catch(() => ({ data: [] })),
      leaderboard.winners().catch(() => ({ data: [] })),
      leaderboard.weekInfo().catch(() => ({ data: null })),
      eventsApi.list().catch(() => ({ data: [] })),
    ]).then(([w, a, win, info, ev]) => {
      setWeekly(Array.isArray(w.data) ? w.data : []);
      setAllTime(Array.isArray(a.data) ? a.data : []);
      setWinners(Array.isArray(win.data) ? win.data : []);
      setWeekInfo(info.data);
      // Only show competition/hackathon events that have ended
      const comps = (Array.isArray(ev.data) ? ev.data : [])
        .filter(e => (e.event_type === "competition" || e.event_type === "hackathon") && (e.status === "completed" || e.status === "past"));
      setCompetitionEvents(comps);
      setLoading(false);
    });
  }, []);

  // Fetch event leaderboard when event selected
  useEffect(() => {
    if (!selectedEventId) { setEventLb([]); return; }
    setEventLbLoading(true);
    eventsApi.leaderboard(selectedEventId)
      .then(r => setEventLb(Array.isArray(r.data) ? r.data : []))
      .catch(() => setEventLb([]))
      .finally(() => setEventLbLoading(false));
  }, [selectedEventId]);

  const current = tab === "weekly" ? weekly : tab === "alltime" ? allTime : tab === "events" ? eventLb : winners;
  const rankColors = ["text-warning", "text-text-muted", "text-warning/70"];

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="glacier" intensity={0.15} />
      <div className="relative z-10 space-y-10 pb-16">
        <MonumentHero
          monument="glacier"
          title="Leaderboard"
          subtitle="Rankings"
          description={weekInfo ? `Week resets: ${new Date(weekInfo.ends_at || weekInfo.end).toLocaleDateString()}` : undefined}
        />

        <div className="flex flex-wrap justify-center gap-3">
          {[
            { key: "weekly", label: "This Week" },
            { key: "alltime", label: "All Time" },
            { key: "winners", label: "Hall of Fame" },
            { key: "events", label: "Events" },
          ].map((t) => (
            <Button
              key={t.key}
              variant={tab === t.key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* Event selector for Events tab */}
        {tab === "events" && (
          <div className="mx-auto max-w-md">
            <select
              value={selectedEventId}
              onChange={e => setSelectedEventId(e.target.value)}
              className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white outline-none focus:border-primary/30"
            >
              <option value="">— Select a competition —</option>
              {competitionEvents.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
            {competitionEvents.length === 0 && (
              <p className="mt-2 text-center text-xs text-text-dim">No completed competitions yet</p>
            )}
          </div>
        )}

        {(loading || (tab === "events" && eventLbLoading)) ? (
          <div className="relative z-10 flex justify-center py-20">
            <Loader variant="orbit" size="lg" label="Loading rankings..." />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mx-auto max-w-3xl"
          >
            {/* Top 3 podium */}
            {current.length >= 3 && tab !== "winners" && (
              <div className="mb-8 grid grid-cols-3 gap-4">
                {[1, 0, 2].map((idx) => {
                  const p = current[idx];
                  if (!p) return null;
                  const rank = idx + 1;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className={`text-center ${idx === 0 ? "order-first md:order-none md:-mt-4" : ""}`}
                    >
                      <Card variant={rank === 1 ? "glow" : "glass"} className="text-center" style={{ boxShadow: "0 0 20px var(--page-glow)" }}>
                        <p className={`math-text text-3xl font-bold ${rankColors[rank - 1] || "text-text-dim"}`}>
                          #{rank}
                        </p>
                        <p className="mt-2 text-sm font-medium text-white">{p.name || p.student_name}</p>
                        {p.title && <p className="font-mono text-[9px] uppercase tracking-wider text-secondary/70">{p.title}</p>}
                        <p className="math-text mt-1 text-2xl font-bold text-primary">
                          {p.xp || p.weekly_xp || p.total_xp || p.score || 0}
                        </p>
                        <p className="font-mono text-[10px] text-text-dim">XP</p>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Full list */}
            <Card variant="solid">
              <div className="space-y-2">
                {current.length === 0 && (
                  <p className="py-8 text-center text-text-dim">No rankings available yet.</p>
                )}
                {current.map((player, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.04 }}
                    className="flex items-center gap-4 rounded-xl border border-line/10 bg-black/10 px-4 py-3"
                  >
                    <span className={`math-text flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      i < 3 ? `${rankColors[i]} bg-warning/10` : "bg-white/5 text-text-dim"
                    }`}>
                      {i + 1}
                    </span>
                    <Link to={player.user_id ? `/student/${player.user_id}` : "#"} className="flex-1 min-w-0 transition hover:opacity-80">
                      <p className="text-sm font-medium text-white truncate hover:text-primary">
                        {player.name || player.student_name}
                      </p>
                      <p className="font-mono text-[10px] text-text-dim truncate">
                        {player.title || player.email || ""}
                      </p>
                    </Link>
                    <span className="math-text text-lg font-bold text-primary">
                      {player.xp || player.weekly_xp || player.total_xp || player.score || 0}
                    </span>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
