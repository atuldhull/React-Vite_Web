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
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="truncate font-mono text-[10px] text-text-dim">
          {current} / {max} registered
        </span>
        {/* tabular-nums + min-w keep the percentage right-aligned in a
            stable column instead of shifting 1px each time the count
            ticks up by 10/100/... Also prevents visual overlap with
            the left label on narrow cards. */}
        <span className={`math-text shrink-0 text-right tabular-nums text-[11px] font-bold [min-width:2.5rem] ${
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
