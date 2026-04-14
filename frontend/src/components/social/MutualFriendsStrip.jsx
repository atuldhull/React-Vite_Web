/**
 * MutualFriendsStrip — avatar row showing mutual friends between
 * the current viewer and a target user. Rendered on the Overview
 * tab of rich profiles and (later) inside UserHoverCard.
 *
 * Input format matches the /api/users/:id/mutual-friends response:
 *   { mutual: [{ id, name, avatar_emoji, avatar_color }], count }
 *
 * Layout
 * ──────
 * Horizontal row of up to `max` avatars (default 5) with the
 * remaining count rendered as a "+N" pill at the end. Clicking
 * an avatar navigates to that user's profile.
 *
 * No-op branches
 * ──────────────
 * Returns null when count === 0 — the "You have 0 mutual friends"
 * case is visually empty anyway; a dedicated empty state would be
 * more clutter than help on the Overview tab.
 */

import { Link } from "react-router-dom";

/**
 * @param {{
 *   mutual: Array<{ id: string, name: string, avatar_emoji?: string | null, avatar_color?: string | null }>,
 *   count: number,
 *   max?: number,
 *   className?: string,
 * }} props
 */
export default function MutualFriendsStrip({ mutual = [], count = 0, max = 5, className = "" }) {
  if (!count || mutual.length === 0) return null;

  const shown = mutual.slice(0, max);
  const overflow = Math.max(0, count - shown.length);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex -space-x-2">
        {shown.map((u) => (
          <Link
            key={u.id}
            to={`/profile/${u.id}`}
            className="relative h-9 w-9 rounded-full border-2 border-surface bg-panel/80 flex items-center justify-center text-lg shadow-sm transition hover:z-10 hover:scale-110"
            style={{ backgroundColor: u.avatar_color || undefined }}
            title={u.name}
            aria-label={u.name}
          >
            <span aria-hidden>{u.avatar_emoji || "👤"}</span>
          </Link>
        ))}
        {overflow > 0 && (
          <div
            className="relative h-9 w-9 rounded-full border-2 border-surface bg-panel/60 flex items-center justify-center font-mono text-[10px] font-bold text-text-muted"
            aria-label={`and ${overflow} more mutual friends`}
          >
            +{overflow}
          </div>
        )}
      </div>
      <p className="font-mono text-[11px] text-text-dim">
        {count} mutual {count === 1 ? "friend" : "friends"}
      </p>
    </div>
  );
}
