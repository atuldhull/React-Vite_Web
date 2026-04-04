/**
 * UpgradePrompt — Shown when a feature requires a higher plan.
 *
 * Variants:
 *   - "inline" (default): Small banner within a page
 *   - "fullpage": Takes over the entire content area
 *   - "badge": Tiny lock icon next to a button/nav item
 */

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FEATURES_BY_KEY } from "@/config/features";
import Button from "@/components/ui/Button";

export default function UpgradePrompt({ featureKey, variant = "inline", currentPlan, className = "" }) {
  const feature = FEATURES_BY_KEY[featureKey];
  const label = feature?.label || featureKey;
  const icon = feature?.icon || "🔒";
  const description = feature?.description || "This feature is not available on your current plan.";

  // Find which plan includes this feature
  const requiredPlan = feature?.plans?.[0] || "professional";

  if (variant === "badge") {
    return (
      <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-warning/10 px-1.5 py-0.5 font-mono text-[8px] uppercase text-warning"
        title={`Requires ${requiredPlan} plan`}>
        🔒 {requiredPlan}
      </span>
    );
  }

  if (variant === "fullpage") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`flex min-h-[50vh] flex-col items-center justify-center text-center px-4 ${className}`}
      >
        <span className="text-5xl">{icon}</span>
        <h2 className="mt-4 font-display text-2xl font-bold text-white">{label}</h2>
        <p className="mt-2 max-w-md text-sm text-text-muted">{description}</p>
        <div className="mt-3 rounded-full border border-warning/20 bg-warning/8 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-warning">
          Requires {requiredPlan} plan
          {currentPlan && <span className="ml-2 text-text-dim">· Current: {currentPlan}</span>}
        </div>
        <div className="mt-6 flex gap-3">
          <Link to="/billing">
            <Button size="sm">Upgrade Plan</Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">Go Back</Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  // Default: inline banner
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className={`rounded-xl border border-warning/20 bg-warning/5 px-4 py-3 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-text-dim">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-warning/10 px-2 py-0.5 font-mono text-[8px] uppercase text-warning">
            {requiredPlan}
          </span>
          <Link to="/billing">
            <Button variant="secondary" size="sm">Upgrade</Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
