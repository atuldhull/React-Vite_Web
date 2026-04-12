import { motion } from "framer-motion";
import Card from "@/components/ui/Card";

export default function ActivityStatsCard({ xp, level, stats, currentTitle }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card variant="glass">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
          Activity
        </p>
        <h2 className="mt-2 font-display text-2xl font-bold text-white">
          Your Stats
        </h2>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "XP Earned",
              value: xp.toLocaleString(),
              color: "text-primary",
            },
            {
              label: "Level",
              value: level,
              color: "text-secondary",
            },
            {
              label: "Quizzes Taken",
              value: stats?.quizzesTaken ?? stats?.testsAttempted ?? "--",
              color: "text-glow",
            },
            {
              label: "Accuracy",
              value:
                stats?.accuracy != null
                  ? `${Math.round(stats.accuracy)}%`
                  : stats?.correctAnswers != null && stats?.totalAnswers
                    ? `${Math.round((stats.correctAnswers / stats.totalAnswers) * 100)}%`
                    : "--",
              color: "text-success",
            },
            {
              label: "Challenges Solved",
              value: stats?.challengesSolved ?? stats?.arenaAttempts ?? "--",
              color: "text-warning",
            },
            {
              label: "Current Streak",
              value: stats?.streak ?? stats?.currentStreak ?? "--",
              color: "text-danger",
            },
            {
              label: "Best Streak",
              value: stats?.bestStreak ?? stats?.longestStreak ?? "--",
              color: "text-primary",
            },
            {
              label: "Rank",
              value: stats?.rank ?? currentTitle.title,
              color: "text-glow",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.05 }}
              className="rounded-2xl border border-line/10 bg-black/10 px-3 py-4 text-center"
            >
              <p className={`math-text text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </Card>
    </motion.section>
  );
}
