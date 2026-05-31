/**
 * BookmarkButton — universal "save for later" toggle.
 *
 * Drops onto any card / detail page. Pass `type` ("problem" | "writeup"
 * | "roadmap"), `id`, and an optional `initial` flag (from a parent's
 * bulk state fetch — see bookmarks.state). The button manages its own
 * optimistic state from there.
 *
 * Renders as a small star button. `compact` shrinks it to fit on
 * tightly-packed list-card corners; `withLabel` shows "Save" /
 * "Saved" text next to it for the detail-page surface.
 *
 * The click handler stopPropagation()s — these buttons live inside
 * <Link> cards and we don't want a click to bookmark AND navigate.
 */

import { useEffect, useState, useCallback } from "react";
import { bookmarks } from "@/lib/api";

export default function BookmarkButton({
  type,
  id,
  initial = false,
  compact = false,
  withLabel = false,
  onToggle,
}) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy]   = useState(false);

  // If the parent re-reads `initial` (e.g. after a route change),
  // re-sync. Avoids stale "Saved" when the parent's bulk-fetch lands
  // late.
  useEffect(() => { setSaved(initial); }, [initial]);

  const onClick = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next);                       // optimistic
    setBusy(true);
    try {
      const { data } = await bookmarks.toggle(type, id);
      setSaved(Boolean(data.saved));
      if (onToggle) onToggle(Boolean(data.saved));
    } catch {
      setSaved(!next);                    // roll back
    } finally {
      setBusy(false);
    }
  }, [busy, saved, type, id, onToggle]);

  const sizes = compact
    ? "h-7 w-7 text-sm"
    : "h-9 px-2.5 text-base";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      title={saved ? "Saved" : "Save for later"}
      className={
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border transition " +
        sizes + " " +
        (saved
          ? "border-warning/40 bg-warning/12 text-warning hover:bg-warning/20"
          : "border-line/20 bg-white/[0.04] text-text-soft hover:border-warning/40 hover:text-warning")
      }
    >
      <span aria-hidden="true">{saved ? "★" : "☆"}</span>
      {withLabel && (
        <span className="font-mono text-[11px] uppercase tracking-wider">{saved ? "Saved" : "Save"}</span>
      )}
    </button>
  );
}
