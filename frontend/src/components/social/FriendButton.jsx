/**
 * FriendButton — state-machine button for Phase-15 profile integration.
 *
 * Reads the current relationship from the Zustand store via
 * useRelationship, and dispatches the right mutation through
 * useProfileActions on click. All optimistic updates + cache
 * invalidation happen inside the hooks — this component is a thin
 * view layer that picks which label + handler to render.
 *
 * The 7 render states map 1:1 to the backend's relationship enum:
 *
 *   ┌────────────────────┬─────────────────────────────────────────┐
 *   │  friendship state  │  what the button looks like             │
 *   ├────────────────────┼─────────────────────────────────────────┤
 *   │  self              │  hidden (null return)                   │
 *   │  null              │  "+ Add Friend"                         │
 *   │  pending_sent      │  "Requested" (click → cancel)           │
 *   │  pending_received  │  inline pair: "Accept" + "Decline"      │
 *   │  accepted          │  "Friends ✓" (hover → "Unfriend")       │
 *   │  blocked by me     │  hidden                                  │
 *   │  blocked by them   │  hidden                                  │
 *   └────────────────────┴─────────────────────────────────────────┘
 *
 * Loading state is per-BUTTON, not per-relationship — two clicks on
 * the same button within its own pending window are ignored, but an
 * accept-click while a send-click is still in flight elsewhere is
 * allowed. The shared relationship-store reconciles on resolve.
 *
 * Styling
 * ───────
 * Uses the existing Button primitive from components/ui so this
 * slot-in respects theme tokens + hover/focus states without us
 * re-inventing them.
 */

import { useState } from "react";
import { useRelationship } from "@/hooks/useRelationship";
import { useProfileActions } from "@/hooks/useProfileActions";
import Button from "@/components/ui/Button";

/**
 * @param {{
 *   userId: string,
 *   size?: "sm" | "md" | "lg",
 *   onChange?: () => void,    // optional callback after any successful action
 * }} props
 */
export default function FriendButton({ userId, size = "sm", onChange }) {
  const { state, loading } = useRelationship(userId);
  const actions = useProfileActions(userId);
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Hidden in any case where there's no action to offer.
  if (!userId)              return null;
  if (loading && !state)    return null;   // don't flash a button before we know the state
  if (!state)               return null;
  if (state.self)           return null;
  if (state.blocked)        return null;   // both 'by_me' and 'by_them' hide

  // One shared click wrapper that manages the local loading flag.
  // Callers pass the specific action; we handle busy + onChange + swallow.
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      onChange?.();
    } catch {
      // Errors already surfaced by the hook's invalidate + store
      // rollback logic (future enhancement: surface a toast here).
    } finally {
      setBusy(false);
    }
  };

  // ── pending_received: two buttons side-by-side ──
  if (state.friendship === "pending_received") {
    return (
      <div className="flex gap-2">
        <Button size={size} variant="primary" loading={busy} onClick={() => run(actions.acceptRequest)}>
          Accept
        </Button>
        <Button size={size} variant="ghost" loading={busy} onClick={() => run(actions.declineRequest)}>
          Decline
        </Button>
      </div>
    );
  }

  // ── pending_sent: "Requested" with click-to-cancel ──
  if (state.friendship === "pending_sent") {
    return (
      <Button
        size={size}
        variant="ghost"
        loading={busy}
        onClick={() => run(actions.cancelRequest)}
        // Hint so users realise Requested is clickable; aria keeps it
        // accessible without a visible tooltip on mobile.
        title="Cancel request"
        aria-label="Cancel friend request"
      >
        Requested ✓
      </Button>
    );
  }

  // ── accepted: "Friends ✓" / hover: "Unfriend" ──
  if (state.friendship === "accepted") {
    return (
      <Button
        size={size}
        variant={hovered ? "danger" : "secondary"}
        loading={busy}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (!window.confirm("Unfriend this user? You can re-send a friend request later.")) return;
          run(actions.unfriend);
        }}
        aria-label={hovered ? "Unfriend" : "Friends"}
      >
        {hovered ? "Unfriend" : "Friends ✓"}
      </Button>
    );
  }

  // ── default: no friendship row → "Add Friend" ──
  return (
    <Button
      size={size}
      variant="primary"
      loading={busy}
      onClick={() => run(actions.sendRequest)}
      aria-label="Send friend request"
    >
      + Add Friend
    </Button>
  );
}
