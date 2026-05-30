/**
 * EventTypeBadge — colored badge for event types.
 *
 * Maps event_type to monument accent colors.
 *
 * memo (Phase 13) — same rationale as EventStatusBadge: list-rendered
 * pure component, primitive props, parent re-renders frequently.
 */

import { memo } from "react";

const TYPE_CONFIG = {
  hackathon:   { label: "Hackathon",   cssVar: "--monument-magma",   icon: "🔥" },
  workshop:    { label: "Workshop",    cssVar: "--monument-jungle",  icon: "🛠️" },
  competition: { label: "Competition", cssVar: "--monument-glacier", icon: "🏆" },
  seminar:     { label: "Seminar",     cssVar: "--monument-pyramid", icon: "📚" },
  general:     { label: "Event",       cssVar: "--monument-desert",  icon: "📅" },
};

function EventTypeBadge({ type, showIcon = true, className = "" }) {
  const config = TYPE_CONFIG[(type || "general").toLowerCase()] || TYPE_CONFIG.general;
  const accentColor = `var(${config.cssVar})`;

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] ${className}`}
      style={{
        padding: "0.2rem 0.6rem",
        color: accentColor,
        background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accentColor} 30%, transparent)`,
        borderRadius: "0.25rem",
      }}
    >
      {showIcon && <span className="text-xs">{config.icon}</span>}
      {config.label}
    </span>
  );
}

export default memo(EventTypeBadge);
