import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import MonumentBackground from "@/components/backgrounds/MonumentBackground";
import { useMonument } from "@/hooks/useMonument";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Loader from "@/components/ui/Loader";
import { arena } from "@/lib/api";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function TestHistoryPage() {
  useMonument("pyramid");
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      setError(null);
      const [histRes, statsRes] = await Promise.all([
        arena.history(),
        arena.stats(),
      ]);
      setHistory(histRes.data);
      setStats(statsRes.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="pyramid" intensity={0.12} />
        <div className="relative z-10 flex min-h-[60vh] items-center justify-center">
          <Loader variant="orbit" size="lg" label="Loading history..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ position: "relative" }}>
        <MonumentBackground monument="pyramid" intensity={0.12} />
        <div className="relative z-10 flex min-h-[60vh] flex-col items-center justify-center gap-4">
          <p className="text-danger">{error}</p>
          <Button variant="secondary" size="sm" onClick={fetchData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const totalAttempts = stats?.totalAttempts ?? history.length;
  const correctCount = stats?.correct ?? history.filter((h) => h.correct).length;
  const incorrectCount = stats?.incorrect ?? totalAttempts - correctCount;
  const accuracy =
    totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
  const totalXP = stats?.totalXp ?? history.reduce((sum, h) => sum + (h.xpEarned || 0), 0);

  return (
    <div style={{ position: "relative" }}>
      <MonumentBackground monument="pyramid" intensity={0.12} />

      <div className="relative z-10 space-y-8 pb-16">
        {/* Header */}
        <motion.section initial="hidden" animate="visible">
          <motion.div custom={0} variants={fadeUp}>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-secondary">
              Mission Log
            </p>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-[-0.05em] text-white sm:text-5xl">
              Test History
            </h1>
            <p className="mt-2 text-text-muted">
              Your complete record of arena challenges and quiz attempts.
            </p>
          </motion.div>
        </motion.section>

        {/* Stats Grid */}
        <motion.section
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
        >
          {[
            { label: "Total Attempts", value: totalAttempts, color: "text-primary" },
            { label: "Correct", value: correctCount, color: "text-success" },
            { label: "Incorrect", value: incorrectCount, color: "text-danger" },
            { label: "Accuracy", value: `${accuracy}%`, color: "text-warning" },
            { label: "Total XP", value: totalXP.toLocaleString(), color: "text-glow" },
          ].map((stat, i) => (
            <motion.div key={stat.label} custom={i + 1} variants={fadeUp}>
              <Card variant="glass" className="text-center">
                <p className={`math-text text-3xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  {stat.label}
                </p>
              </Card>
            </motion.div>
          ))}
        </motion.section>

        {/* Accuracy Visual */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card variant="glow">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">
              Performance
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">
              Accuracy Overview
            </h2>
            <div className="mt-6 flex items-center gap-6">
              <div className="relative flex h-28 w-28 flex-shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="8"
                  />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="url(#accuracyGradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 42}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{
                      strokeDashoffset:
                        2 * Math.PI * 42 * (1 - accuracy / 100),
                    }}
                    transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                  />
                  <defs>
                    <linearGradient id="accuracyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--color-primary, #6366f1)" />
                      <stop offset="50%" stopColor="var(--color-secondary, #a78bfa)" />
                      <stop offset="100%" stopColor="var(--color-glow, #f0abfc)" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="math-text absolute text-2xl font-bold text-white">
                  {accuracy}%
                </span>
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Correct</span>
                    <span className="math-text text-xs text-success">{correctCount}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: totalAttempts > 0 ? `${(correctCount / totalAttempts) * 100}%` : "0%",
                      }}
                      transition={{ delay: 0.8, duration: 1, ease: "easeOut" }}
                      className="h-full rounded-full bg-success"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Incorrect</span>
                    <span className="math-text text-xs text-danger">{incorrectCount}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: totalAttempts > 0 ? `${(incorrectCount / totalAttempts) * 100}%` : "0%",
                      }}
                      transition={{ delay: 0.9, duration: 1, ease: "easeOut" }}
                      className="h-full rounded-full bg-danger"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.section>

        {/* History Table */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card variant="solid">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
              Attempt Log
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">
              All Attempts
            </h2>

            {history.length === 0 ? (
              <div className="mt-8 text-center">
                <p className="text-4xl">📖</p>
                <p className="mt-4 text-sm text-text-muted">
                  No attempts recorded yet. Head to the Arena to start solving!
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line/15">
                      <th className="pb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        Challenge
                      </th>
                      <th className="pb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        Your Answer
                      </th>
                      <th className="pb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        Result
                      </th>
                      <th className="pb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        XP
                      </th>
                      <th className="pb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((attempt, i) => (
                      <motion.tr
                        key={attempt._id || i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 + i * 0.03 }}
                        className="border-b border-line/8"
                      >
                        <td className="py-3 text-white">
                          {attempt.challengeTitle || attempt.challengeName || "Challenge"}
                        </td>
                        <td className="py-3 font-mono text-xs text-text-muted">
                          {attempt.selectedAnswer ?? attempt.selectedIndex ?? "---"}
                        </td>
                        <td className="py-3">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                              attempt.correct
                                ? "border-success/30 bg-success/10 text-success"
                                : "border-danger/30 bg-danger/10 text-danger"
                            }`}
                          >
                            {attempt.correct ? "Correct" : "Wrong"}
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`font-mono text-sm font-bold ${
                              (attempt.xpEarned || 0) > 0 ? "text-success" : "text-text-dim"
                            }`}
                          >
                            {(attempt.xpEarned || 0) > 0
                              ? `+${attempt.xpEarned}`
                              : "0"}
                          </span>
                        </td>
                        <td className="py-3 font-mono text-[11px] text-text-dim">
                          {attempt.createdAt
                            ? new Date(attempt.createdAt).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "---"}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.section>
      </div>
    </div>
  );
}
