import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { teacher } from "@/lib/api";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5 },
  }),
};

export default function TeacherStudentsPage() {
  useMonument("magma");
  const [students, setStudents] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        const [studentsRes, leaderboardRes] = await Promise.all([
          teacher.students(),
          teacher.leaderboard(),
        ]);
        if (cancelled) return;
        setStudents(studentsRes.data);
        setLeaderboard(leaderboardRes.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Failed to load students");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, []);

  async function handleViewPerformance() {
    try {
      setPerfLoading(true);
      const res = await teacher.performance();
      setPerformance(res.data);
      setShowPerformance(true);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load performance data");
    } finally {
      setPerfLoading(false);
    }
  }

  const filtered = students.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(search.toLowerCase()),
  );

  const rankColors = ["text-warning", "text-text-muted", "text-[#cd7f32]"];

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="magma" intensity={0.1} />
        <div className="space-y-6">
          <div className="h-12 w-64 animate-pulse rounded-xl bg-surface/40" />
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="col-span-2 h-96 animate-pulse rounded-[1.75rem] border border-line/15 bg-surface/40" />
            <div className="h-96 animate-pulse rounded-[1.75rem] border border-line/15 bg-surface/40" />
          </div>
        </div>
      </div>
    );
  }

  if (error && students.length === 0) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="magma" intensity={0.1} />
        <Card variant="solid" className="text-center">
          <div className="flex flex-col items-center gap-3 py-8">
            <svg className="h-10 w-10 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-danger">{error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
    <MonumentBackground monument="magma" intensity={0.1} />
    <motion.div initial="hidden" animate="visible" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Student Manager</h2>
          <p className="text-sm text-text-muted">{students.length} enrolled students</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={perfLoading}
          onClick={handleViewPerformance}
        >
          {showPerformance ? "Refresh Performance" : "View Performance"}
        </Button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-line/15 bg-surface/50 px-4 py-3 text-sm text-white placeholder-text-dim backdrop-blur outline-none transition focus:border-primary/30"
      />

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Student table */}
        <motion.div custom={1} variants={fadeUp} className="xl:col-span-2">
          <Card variant="solid" className="overflow-hidden">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
              Roster
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-white">
              All Students
            </h3>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line/10 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">XP</th>
                    <th className="px-4 py-3">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-text-dim">
                        {search ? "No students match your search" : "No students found"}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => (
                      <tr
                        key={s._id || s.email}
                        className="border-b border-line/5 transition hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs text-primary">
                              {(s.name || "?").charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium text-white">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-text-muted">{s.email}</td>
                        <td className="px-4 py-3 font-mono text-primary">{s.xp ?? 0}</td>
                        <td className="px-4 py-3 font-mono text-secondary">{s.solvedCount ?? s.solved ?? 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>

        {/* Leaderboard sidebar */}
        <motion.div custom={2} variants={fadeUp}>
          <Card variant="glass">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
              Rankings
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-white">
              Leaderboard
            </h3>

            <div className="mt-4 space-y-2">
              {leaderboard.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-dim">No rankings available</p>
              ) : (
                leaderboard.slice(0, 10).map((entry, i) => (
                  <div
                    key={entry._id || i}
                    className="flex items-center justify-between rounded-xl border border-line/10 bg-black/10 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                          i < 3
                            ? `${rankColors[i]} bg-white/[0.06]`
                            : "text-text-dim bg-white/[0.03]"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm text-white">{entry.name || entry.userName}</p>
                        <p className="font-mono text-[10px] text-text-dim">
                          {entry.xp ?? 0} XP
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-success">
                      {entry.solvedCount ?? entry.solved ?? 0} solved
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Performance breakdown */}
      {showPerformance && performance.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card variant="glass">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
              Analytics
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-white">
              Per-Challenge Performance
            </h3>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line/10 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                    <th className="px-4 py-3">Challenge</th>
                    <th className="px-4 py-3">Attempts</th>
                    <th className="px-4 py-3">Correct</th>
                    <th className="px-4 py-3">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {performance.map((p, i) => {
                    const accuracy =
                      p.attempts > 0
                        ? Math.round((p.correct / p.attempts) * 100)
                        : 0;
                    return (
                      <tr
                        key={p._id || i}
                        className="border-b border-line/5 transition hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          {p.title || p.challengeTitle || `Challenge ${i + 1}`}
                        </td>
                        <td className="px-4 py-3 font-mono text-text-muted">{p.attempts ?? 0}</td>
                        <td className="px-4 py-3 font-mono text-success">{p.correct ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${accuracy}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-text-dim">{accuracy}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
    </div>
  );
}
