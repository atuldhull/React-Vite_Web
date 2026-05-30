/**
 * usePauseOnHidden — returns true when the tab is currently in the
 * background (document.visibilityState !== "visible"). Components
 * that drive continuous animation (rAF, GSAP timelines, framer-motion
 * infinite loops, ambient particle systems) should gate their work
 * on this so background tabs don't burn CPU / battery for nothing.
 *
 * Why "isHidden" instead of "isActive"
 *   Returning the negative form means the common usage pattern is a
 *   short early-return:
 *
 *     useEffect(() => {
 *       if (isHidden) return;
 *       const id = requestAnimationFrame(loop);
 *       return () => cancelAnimationFrame(id);
 *     }, [isHidden]);
 *
 *   The effect re-runs when visibility flips, the old rAF is
 *   cancelled, and the loop restarts from a clean state on return.
 *
 * Pairs with GSAP's `gsap.ticker.lagSmoothing(0)` — without that, a
 * timeline that "missed" a 5-minute hidden window will try to
 * catch up with one huge frame, which looks awful. usePauseOnHidden
 * SHOULD be the only thing your timeline cares about; consumers
 * that drive a timeline themselves should call `tl.pause()` /
 * `tl.resume()` in their effect.
 */

import { useEffect, useState } from "react";

function isCurrentlyHidden() {
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "visible";
}

export function usePauseOnHidden() {
  const [hidden, setHidden] = useState(isCurrentlyHidden);

  useEffect(() => {
    const onChange = () => setHidden(isCurrentlyHidden());
    document.addEventListener("visibilitychange", onChange);
    // Some browsers don't always fire visibilitychange on tab close /
    // pagehide (especially when the user navigates away via a link
    // mid-animation). pagehide as a belt-and-braces fallback so the
    // animation can react before unmount.
    window.addEventListener("pagehide", onChange);
    window.addEventListener("pageshow",  onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      window.removeEventListener("pagehide", onChange);
      window.removeEventListener("pageshow",  onChange);
    };
  }, []);

  return hidden;
}
