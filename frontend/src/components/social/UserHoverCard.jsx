/**
 * UserHoverCard — wraps any child element (typically a user's name)
 * and dispatches the hovercard-store to show a rich card on hover
 * or tap-and-hold.
 *
 * Usage:
 *   <UserHoverCard userId={row.user_id}>
 *     <span className="font-bold">{row.name}</span>
 *   </UserHoverCard>
 *
 * The wrapper is a display: contents equivalent — it doesn't add a
 * visual element, just attaches pointer/focus event handlers to its
 * single child via a tiny <span> shell. Children can be any inline
 * content; we wrap in <span> (not <div>) to preserve inline layout
 * inside tables, lists, etc.
 *
 * Triggers
 * ────────
 * Desktop:
 *   - mouseenter with 250ms delay → show (prevents accidental
 *     hovercards when the cursor is just passing through)
 *   - mouseleave → hide with 150ms grace period so the user can
 *     move the cursor FROM the trigger INTO the card without it
 *     closing. The card's own onMouseEnter cancels the hide.
 *   - focus / blur → same as hover (keyboard accessibility)
 *
 * Mobile:
 *   - touchstart + 500ms hold → show (long-press gesture)
 *   - a normal tap still follows the child's click handler (e.g.
 *     a Link navigating to /profile/:id). The long-press detector
 *     only fires if the finger STAYS down for 500ms without
 *     moving more than 8px.
 *
 * Self-hide
 * ─────────
 * The wrapper does NOT own the open state. The store does. That
 * means if two wrappers are adjacent, hovering from one to the
 * other just updates the store's { userId, anchorRect } — no
 * close-then-open flicker.
 */

import { useEffect, useRef } from "react";
import { useHovercardStore } from "@/store/hovercard-store";

const ENTER_DELAY_MS = 250;
const LEAVE_DELAY_MS = 150;
const LONG_PRESS_MS  = 500;
const MOVE_CANCEL_PX = 8;

/**
 * @param {{
 *   userId: string,
 *   children: React.ReactNode,
 *   disabled?: boolean,      // when true, render children as-is (no hovercard)
 *   as?: string,             // wrapper tag — default "span"
 *   className?: string,
 * }} props
 */
export default function UserHoverCard({ userId, children, disabled = false, as = "span", className }) {
  const show  = useHovercardStore((s) => s.show);
  const hide  = useHovercardStore((s) => s.hide);
  const unpin = useHovercardStore((s) => s.unpin);

  const ref = useRef(null);
  const enterTimer = useRef(null);
  const leaveTimer = useRef(null);
  const pressTimer = useRef(null);
  const pressStart = useRef({ x: 0, y: 0 });

  // Cleanup on unmount — stray timers would otherwise trigger show()
  // after the wrapper has been removed from the DOM.
  useEffect(() => () => {
    clearTimeout(enterTimer.current);
    clearTimeout(leaveTimer.current);
    clearTimeout(pressTimer.current);
  }, []);

  if (disabled || !userId) {
    // Passthrough — render children without any wrapper wiring.
    return children;
  }

  const triggerShow = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    show(userId, {
      top:    r.top,
      left:   r.left,
      width:  r.width,
      height: r.height,
    });
  };

  const handleMouseEnter = () => {
    clearTimeout(leaveTimer.current);
    clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(triggerShow, ENTER_DELAY_MS);
  };

  const handleMouseLeave = () => {
    clearTimeout(enterTimer.current);
    clearTimeout(leaveTimer.current);
    unpin();
    leaveTimer.current = setTimeout(hide, LEAVE_DELAY_MS);
  };

  const handleFocus = () => {
    clearTimeout(enterTimer.current);
    // Slight delay on focus too so a quick tab-through doesn't pop
    // cards on every focusable name.
    enterTimer.current = setTimeout(triggerShow, ENTER_DELAY_MS);
  };

  const handleBlur = () => {
    clearTimeout(enterTimer.current);
    leaveTimer.current = setTimeout(hide, LEAVE_DELAY_MS);
  };

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    pressStart.current = { x: t.clientX, y: t.clientY };
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      // Long-press fired — show the card pinned so a finger-release
      // doesn't immediately dismiss it.
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      show(userId, {
        top:    r.top,
        left:   r.left,
        width:  r.width,
        height: r.height,
      }, { pinned: true });
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e) => {
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - pressStart.current.x);
    const dy = Math.abs(t.clientY - pressStart.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      // User is scrolling — not pressing. Cancel the long-press.
      clearTimeout(pressTimer.current);
    }
  };

  const handleTouchEnd = () => {
    clearTimeout(pressTimer.current);
  };

  const Tag = as;
  return (
    <Tag
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={className}
    >
      {children}
    </Tag>
  );
}
