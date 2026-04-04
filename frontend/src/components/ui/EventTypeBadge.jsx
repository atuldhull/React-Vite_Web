/**
 * EventTypeBadge — colored badge for event types.
 *
 * Maps event_type to monument accent colors.
 */

const TYPE_CONFIG = {
  hackathon:   { label: "Hackathon",   color: "#FF6B35", bg: "rgba(255,107,53,0.12)",  border: "rgba(255,107,53,0.3)",  icon: "🔥" },
  workshop:    { label: "Workshop",    color: "#2ECC71", bg: "rgba(46,204,113,0.12)",   border: "rgba(46,204,113,0.3)",  icon: "🛠️" },
  competition: { label: "Competition", color: "#00CFFF", bg: "rgba(0,207,255,0.12)",    border: "rgba(0,207,255,0.3)",   icon: "🏆" },
  seminar:     { label: "Seminar",     color: "#7B4FE0", bg: "rgba(123,79,224,0.12)",   border: "rgba(123,79,224,0.3)",  icon: "📚" },
  general:     { label: "Event",       color: "#D4A017", bg: "rgba(212,160,23,0.12)",   border: "rgba(212,160,23,0.3)",  icon: "📅" },
};

export default function EventTypeBadge({ type, showIcon = true, className = "" }) {
  const config = TYPE_CONFIG[(type || "general").toLowerCase()] || TYPE_CONFIG.general;

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.15em] ${className}`}
      style={{
        padding: "0.2rem 0.6rem",
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: "0.25rem",
      }}
    >
      {showIcon && <span className="text-xs">{config.icon}</span>}
      {config.label}
    </span>
  );
}
