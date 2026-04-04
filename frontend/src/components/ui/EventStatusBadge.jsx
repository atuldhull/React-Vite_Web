/**
 * EventStatusBadge — colored pill badge for event lifecycle status.
 *
 * Uses the event status color tokens from theme.css.
 * Follows the same clip-path + mono font pattern as difficulty badges.
 */

const STATUS_CONFIG = {
  registering: { label: "Registering", color: "rgb(var(--event-registering))", bg: "rgba(var(--event-registering), 0.12)", border: "rgba(var(--event-registering), 0.3)" },
  active:      { label: "Live Now",    color: "rgb(var(--event-active))",      bg: "rgba(var(--event-active), 0.12)",      border: "rgba(var(--event-active), 0.3)" },
  completed:   { label: "Completed",   color: "rgb(var(--event-completed))",   bg: "rgba(var(--event-completed), 0.10)",   border: "rgba(var(--event-completed), 0.2)" },
  closed:      { label: "Closed",      color: "rgb(var(--event-closed))",      bg: "rgba(var(--event-closed), 0.12)",      border: "rgba(var(--event-closed), 0.3)" },
  cancelled:   { label: "Cancelled",   color: "rgb(var(--event-cancelled))",   bg: "rgba(var(--event-cancelled), 0.12)",   border: "rgba(var(--event-cancelled), 0.3)" },
  waitlisted:  { label: "Waitlisted",  color: "rgb(var(--event-waitlisted))",  bg: "rgba(var(--event-waitlisted), 0.12)",  border: "rgba(var(--event-waitlisted), 0.3)" },
  upcoming:    { label: "Upcoming",    color: "rgb(var(--event-upcoming))",    bg: "rgba(var(--event-upcoming), 0.12)",    border: "rgba(var(--event-upcoming), 0.3)" },
  past:        { label: "Past",        color: "rgb(var(--event-completed))",   bg: "rgba(var(--event-completed), 0.08)",   border: "rgba(var(--event-completed), 0.15)" },
};

export default function EventStatusBadge({ status, className = "" }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.upcoming;

  return (
    <span
      className={`inline-block font-mono text-[10px] uppercase tracking-[0.2em] ${className}`}
      style={{
        clipPath: "var(--clip-para)",
        padding: "0.2rem 0.75rem",
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  );
}
