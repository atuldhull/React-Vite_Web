import { motion } from "framer-motion";
import Card from "@/components/ui/Card";

export default function XPSidebar({ xp, level, currentTitle, nextTitle, xpTitles, progressToNext }) {
  return (
    <>
      {/* ── XP Card ── */}
      <Card variant="glow">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-glow">
          Experience
        </p>
        <div className="mt-4 text-center">
          <p className="math-text text-5xl font-bold text-white">
            {xp.toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-text-dim">
            Total XP
          </p>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">{currentTitle.title}</span>
            <span className="font-mono text-xs text-white">
              {nextTitle ? nextTitle.title : "Max Rank"}
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progressToNext, 100)}%` }}
              transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
              className="relative h-full overflow-hidden rounded-full"
              style={{ background: "var(--monument-sky)" }}
            >
              <span
                className="absolute inset-0"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "xpShimmer 2s ease-in-out infinite",
                }}
              />
            </motion.div>
          </div>
          <style>{`@keyframes xpShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
          {nextTitle && (
            <p className="mt-2 text-center text-xs text-text-dim">
              {((nextTitle.minXp || 0) - xp).toLocaleString()} XP to{" "}
              <span className="text-white">{nextTitle.title}</span>
            </p>
          )}
        </div>
      </Card>

      {/* ── Title Progression ── */}
      <Card variant="solid">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-secondary">
          Title Progression
        </p>
        <h3 className="mt-2 font-display text-xl font-bold text-white">
          Rank Ladder
        </h3>

        <div className="mt-5 space-y-2">
          {xpTitles.map((t, i) => {
            const isActive = currentTitle.title === t.title;
            const isUnlocked = xp >= t.minXp;

            return (
              <motion.div
                key={t.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.06 }}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition ${
                  isActive
                    ? "border-primary/30 bg-primary/10"
                    : isUnlocked
                      ? "border-line/15 bg-white/[0.03]"
                      : "border-line/8 bg-black/10 opacity-50"
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : isUnlocked
                        ? "bg-success/15 text-success"
                        : "bg-white/5 text-text-dim"
                  }`}
                >
                  {isUnlocked ? "\u2713" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      isActive ? "text-white" : "text-text-muted"
                    }`}
                  >
                    {t.title}
                  </p>
                  <p className="math-text text-[10px] text-text-dim">
                    {(t.minXp ?? 0).toLocaleString()} XP
                  </p>
                </div>
                {isActive && (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-primary">
                    Current
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </Card>

      {/* ── Quick Stats ── */}
      <Card variant="glass">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-warning">
          Quick Stats
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="math-text text-2xl font-bold text-white">{level}</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Level
            </p>
          </div>
          <div>
            <p className="math-text text-2xl font-bold text-white">
              {xp.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
              XP
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
