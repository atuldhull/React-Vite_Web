/**
 * HovercardRoot — portal-mounted shell that renders the currently-
 * shown UserHoverCard, anchored to the triggering element's rect.
 *
 * Mounted ONCE at the app root (e.g. inside the main layout). Every
 * `<UserHoverCard>` wrapper in the tree dispatches into the
 * hovercard-store, and this component subscribes + renders the
 * actual card.
 *
 * Positioning
 * ───────────
 * The card is placed BELOW the trigger by default, center-aligned
 * horizontally. If that would clip off the bottom of the viewport,
 * it flips to render ABOVE. Horizontal alignment shifts left/right
 * to stay within 8px of either viewport edge.
 *
 * We compute the position from `anchorRect` (captured by the wrapper
 * at show time) rather than a live ref — the trigger may have been
 * unmounted before we render, and a live ref would crash.
 *
 * Dismissal
 * ─────────
 *   - ESC key → hide
 *   - scroll  → hide (positioning would drift otherwise)
 *   - click outside the card → hide
 *   - mouse leaves the card → hide after a short grace period
 *     (configured in the wrapper, not here)
 *
 * Content
 * ───────
 * Fetches the profile + mutual-friends via the api client and
 * renders avatar + XP + mutual strip + FriendButton + MessageButton.
 * The profile call respects privacy — if the target has a private
 * profile, we get a minimal card back and render exactly that.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useHovercardStore } from "@/store/hovercard-store";
import { users } from "@/lib/api";
import FriendButton from "@/components/social/FriendButton";
import MessageButton from "@/components/social/MessageButton";
import MutualFriendsStrip from "@/components/social/MutualFriendsStrip";

const CARD_WIDTH  = 280;
const VIEWPORT_PAD = 8;
const GAP_FROM_ANCHOR = 6; // pixels between trigger and card

/**
 * Compute a clamp-to-viewport position for the card given the
 * anchor rect and the card's own measured height.
 */
function placeCard(anchor, cardHeight) {
  if (!anchor) return { top: 0, left: 0 };
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;

  // Horizontal: center on anchor, clamp to viewport edges.
  let left = anchor.left + anchor.width / 2 - CARD_WIDTH / 2;
  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - CARD_WIDTH - VIEWPORT_PAD));

  // Vertical: prefer below; flip above if it would clip bottom.
  const belowTop = anchor.top + anchor.height + GAP_FROM_ANCHOR;
  const wouldClipBottom = belowTop + cardHeight > vh - VIEWPORT_PAD;
  const top = wouldClipBottom
    ? Math.max(VIEWPORT_PAD, anchor.top - cardHeight - GAP_FROM_ANCHOR)
    : belowTop;

  return { top, left };
}

export default function HovercardRoot() {
  const open        = useHovercardStore((s) => s.open);
  const userId      = useHovercardStore((s) => s.userId);
  const anchorRect  = useHovercardStore((s) => s.anchorRect);
  const pinned      = useHovercardStore((s) => s.pinned);
  const hide        = useHovercardStore((s) => s.hide);
  const pin         = useHovercardStore((s) => s.pin);
  const unpin       = useHovercardStore((s) => s.unpin);

  const cardRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [mutual,  setMutual]  = useState({ mutual: [], count: 0 });
  const [loading, setLoading] = useState(false);
  const [loadedFor, setLoadedFor] = useState(null);

  // Fetch profile + mutual friends when userId changes. We cache by
  // userId so re-opening the same card doesn't refetch within a
  // session (hovercard-store doesn't track data, so we keep the
  // last-fetched profile in local state as a cheap one-slot cache).
  useEffect(() => {
    if (!open || !userId) return;
    if (loadedFor === userId) return; // use cached
    let cancelled = false;
    setLoading(true);
    Promise.all([
      users.profile(userId).catch(() => null),
      users.mutualFriends(userId).catch(() => null),
    ]).then(([pRes, mRes]) => {
      if (cancelled) return;
      setProfile(pRes?.data || null);
      setMutual(mRes?.data || { mutual: [], count: 0 });
      setLoadedFor(userId);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, userId, loadedFor]);

  // Dismissal handlers — ESC + scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") hide(); };
    const onScroll = () => hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll",  onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll",  onScroll, { capture: true });
    };
  }, [open, hide]);

  // Outside-click dismissal.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (cardRef.current && !cardRef.current.contains(e.target)) hide();
    };
    // setTimeout so the click that OPENED the card isn't immediately
    // treated as an outside-click. Fires in the next event-loop tick.
    const t = setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, hide]);

  if (typeof document === "undefined") return null;

  // Compute position from the current anchor + the card's own rect.
  // Card height defaults to 180 pre-render; real value applied after
  // first render via useEffect + forceRerender. Not worth it — the
  // 180px fallback is close enough for clip detection in practice.
  const cardHeight = cardRef.current?.offsetHeight || 200;
  const pos = placeCard(anchorRect, cardHeight);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={cardRef}
          role="dialog"
          aria-label="User info"
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          onMouseEnter={pin}
          onMouseLeave={() => { unpin(); hide(); }}
          className="fixed z-[9999] rounded-2xl border border-line/20 bg-panel/95 p-4 shadow-2xl backdrop-blur-xl"
          style={{
            top:   pos.top,
            left:  pos.left,
            width: CARD_WIDTH,
            // defensive: if positioning fails (no anchor), keep card off-screen
            visibility: anchorRect ? "visible" : "hidden",
          }}
        >
          <HovercardContent
            profile={profile}
            mutual={mutual}
            loading={loading && !profile}
            userId={userId}
            // Hide after the user clicks any internal link/button that
            // navigates — otherwise the card can linger over the new
            // page during the route transition.
            onNavigate={hide}
            pinned={pinned}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * Inner content — separate component so the positioning shell above
 * stays focused on layout and dismissal, and this can be unit-tested
 * in isolation.
 */
function HovercardContent({ profile, mutual, loading, userId, onNavigate }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-line/20" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 animate-pulse rounded bg-line/20" />
          <div className="h-2 w-16 animate-pulse rounded bg-line/15" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return <p className="text-xs text-text-dim">Couldn&apos;t load this user.</p>;
  }

  const p = profile.profile || profile;
  const isPrivate = p.isPrivate === true;

  return (
    <div className="space-y-3">
      {/* Header — avatar + name + title */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-2xl shadow"
          style={{ backgroundColor: p.avatar_color || "rgba(255,255,255,0.06)" }}
          aria-hidden
        >
          {p.avatar_emoji || "👤"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {p.name || "Unknown"}
          </p>
          {!isPrivate && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
              {p.title || p.role || "member"}
            </p>
          )}
          {isPrivate && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
              Private profile
            </p>
          )}
        </div>
      </div>

      {/* Stats — only for non-private profiles */}
      {!isPrivate && (
        <div className="flex items-center gap-4 border-y border-line/10 py-2">
          {typeof p.xp === "number" && (
            <div>
              <p className="math-text text-base font-bold text-primary">{p.xp}</p>
              <p className="font-mono text-[9px] uppercase text-text-dim">XP</p>
            </div>
          )}
          {typeof p.friend_count === "number" && (
            <div>
              <p className="math-text text-base font-bold text-white">{p.friend_count}</p>
              <p className="font-mono text-[9px] uppercase text-text-dim">friends</p>
            </div>
          )}
          {typeof p.achievement_count === "number" && (
            <div>
              <p className="math-text text-base font-bold text-white">{p.achievement_count}</p>
              <p className="font-mono text-[9px] uppercase text-text-dim">badges</p>
            </div>
          )}
        </div>
      )}

      {/* Mutual friends */}
      {!isPrivate && mutual?.count > 0 && (
        <MutualFriendsStrip mutual={mutual.mutual} count={mutual.count} max={4} />
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <FriendButton userId={userId} size="sm" />
        <MessageButton userId={userId} size="sm" />
      </div>

      <Link
        to={`/profile/${userId}`}
        onClick={onNavigate}
        className="block text-center font-mono text-[10px] uppercase tracking-wider text-primary/80 hover:text-primary"
      >
        View full profile →
      </Link>
    </div>
  );
}
