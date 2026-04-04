/**
 * CapacityBar — visual fill bar showing registration capacity.
 *
 * Uses the event-capacity-bar CSS classes from theme.css.
 * Shows count/capacity label and changes color when >80% or full.
 */

export default function CapacityBar({ current = 0, max = null, className = "" }) {
  if (max === null || max === undefined) {
    return (
      <span className={`font-mono text-[10px] text-text-dim ${className}`}>
        {current} registered · Unlimited
      </span>
    );
  }

  const pct = Math.min(100, Math.round((current / max) * 100));
  const warn = pct >= 80;
  const full = pct >= 100;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[10px] text-text-dim">
          {current} / {max} registered
        </span>
        <span className={`math-text text-[11px] font-bold ${
          full ? "text-danger" : warn ? "text-warning" : "text-success"
        }`}>
          {pct}%
        </span>
      </div>
      <div className="event-capacity-bar">
        <div
          className="event-capacity-bar-fill"
          data-warn={warn && !full}
          data-full={full}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
