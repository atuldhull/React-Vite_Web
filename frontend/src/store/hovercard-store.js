/**
 * Hovercard store (Phase 15).
 *
 * Backs the single-portal UserHoverCard pattern: one <HovercardRoot>
 * is mounted at the app root, every `<UserHoverCard>` wrapper just
 * dispatches `show()` / `hide()` against this store. Benefits:
 *
 *   - Zero React mounts for the hovercard until one actually opens
 *     (leaderboard with 50 wrapped names = 0 hovercard components
 *     in the tree when nothing is hovered)
 *   - Only one card is ever open at a time — matches UX
 *   - Wrappers stay tiny (no local state, no portals, no positioning)
 *
 * State shape
 * ───────────
 *   open        — whether the card is visible
 *   userId      — target user of the currently-shown card
 *   anchorRect  — DOMRect snapshot of the triggering element; the
 *                 HovercardRoot uses this to position itself
 *   pinned      — when true, the card doesn't auto-close on mouse-leave
 *                 of the trigger. Used for mobile tap-hold + focus.
 *
 * The store is deliberately simple — timing/debounce logic for the
 * enter + leave hover delays lives in the <UserHoverCard> wrapper
 * component where it belongs (React effects, timeouts bound to
 * component lifecycle). The store is just the message bus.
 */

import { create } from "zustand";

/**
 * @typedef {{
 *   open: boolean,
 *   userId: string | null,
 *   anchorRect: { top: number, left: number, width: number, height: number } | null,
 *   pinned: boolean,
 * }} HovercardState
 */

export const useHovercardStore = create((set, get) => ({
  open:       false,
  userId:     null,
  anchorRect: null,
  pinned:     false,

  /**
   * Show the card for `userId`, anchored to `anchorRect`.
   * Replaces any currently-open card (switching hovers between
   * adjacent wrappers feels snappier than close-then-open).
   *
   * @param {string} userId
   * @param {{ top: number, left: number, width: number, height: number }} anchorRect
   * @param {{ pinned?: boolean }} [opts]
   */
  show: (userId, anchorRect, opts = {}) => {
    if (!userId || !anchorRect) return;
    set({ open: true, userId, anchorRect, pinned: !!opts.pinned });
  },

  /** Close the card. No-op if already closed. */
  hide: () => {
    if (!get().open) return;
    set({ open: false, pinned: false });
  },

  /** Pin an open card (used when the card itself is hovered). */
  pin: () => set({ pinned: true }),

  /** Unpin so the next hide() call can close it. */
  unpin: () => set({ pinned: false }),
}));
