/**
 * AchievementBadge — displays an achievement with rarity glow.
 *
 * Uses the achievement-* CSS classes from theme.css.
 * Rarity tiers: common, uncommon, rare, epic, legendary.
 */

import { motion } from "framer-motion";

export default function AchievementBadge({ achievement, unlocked = false, compact = false, className = "" }) {
  if (!achievement) return null;

  const { icon, title, description, rarity = "common", xp_reward } = achievement;

  return (
    <motion.div
      whileHover={unlocked ? { scale: 1.03, y: -2 } : undefined}
      className={`achievement-badge achievement-${rarity} rounded-xl p-3 ${
        unlocked ? "" : "opacity-40 grayscale"
      } ${className}`}
      style={{ clipPath: "var(--clip-notch)" }}
    >
      <div className="flex items-center gap-3">
        <span className={`${compact ? "text-xl" : "text-3xl"} flex-shrink-0`}>{icon || "🏅"}</span>
        <div className="min-w-0 flex-1">
          <p className={`font-display font-bold text-white ${compact ? "text-xs" : "text-sm"}`}>
            {title}
          </p>
          {!compact && description && (
            <p className="mt-0.5 text-[11px] text-text-muted leading-snug">{description}</p>
          )}
        </div>
        {xp_reward > 0 && (
          <span className="math-text text-[11px] font-bold text-primary flex-shrink-0">
            +{xp_reward}
          </span>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
            rarity === "legendary" ? "bg-warning/15 text-warning" :
            rarity === "epic" ? "bg-primary/15 text-primary" :
            rarity === "rare" ? "bg-secondary/15 text-secondary" :
            rarity === "uncommon" ? "bg-success/15 text-success" :
            "bg-text-dim/10 text-text-dim"
          }`}>
            {rarity}
          </span>
          {unlocked && (
            <span className="font-mono text-[8px] text-success uppercase tracking-wider">Unlocked</span>
          )}
        </div>
      )}
    </motion.div>
  );
}
