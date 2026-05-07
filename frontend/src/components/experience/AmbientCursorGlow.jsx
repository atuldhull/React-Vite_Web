/**
 * AmbientCursorGlow — large soft radial that follows the cursor.
 *
 * This complements (does not replace) InteractiveCursor. The existing
 * cursor draws a tight 64px halo + a 12px core right at the pointer.
 * This component draws a much larger 600 px gradient that lazily trails
 * the cursor — the effect is "the page is being lit by a soft lamp
 * the user holds in their hand". Subtle but premium.
 *
 * Heavily damped spring so the glow trails noticeably behind the
 * cursor — that lag is what gives it the "weighted, atmospheric"
 * read. Mounted at the experience-shell level, sits at z-index 1
 * (above page bg, below content) with mix-blend-mode: screen so it
 * brightens dark areas without washing out content.
 *
 * Disabled on touch devices (no hover state to track) and for
 * prefers-reduced-motion users.
 */

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

export default function AmbientCursorGlow() {
  const reduced = useReducedMotion();
  const [isFineCursor, setIsFineCursor] = useState(false);
  const [visible, setVisible] = useState(false);

  // Heavily-damped spring follows the raw pointer with a lag — that
  // lag is what makes it feel like an ambient lighting effect rather
  // than a cursor halo. Stiffness 80 / damping 30 gives ~250 ms catch-up.
  const px = useMotionValue(-400);
  const py = useMotionValue(-400);
  const x  = useSpring(px, { stiffness: 80, damping: 30, mass: 0.8 });
  const y  = useSpring(py, { stiffness: 80, damping: 30, mass: 0.8 });

  useEffect(() => {
    setIsFineCursor(window.matchMedia("(pointer:fine)").matches);
  }, []);

  useEffect(() => {
    if (reduced || !isFineCursor) return undefined;
    const onMove = (e) => {
      px.set(e.clientX);
      py.set(e.clientY);
      setVisible(true);
    };
    const onLeave = () => setVisible(false);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [reduced, isFineCursor, px, py]);

  if (reduced || !isFineCursor) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[1]"
      style={{
        x,
        y,
        width: 600,
        height: 600,
        translateX: "-50%",
        translateY: "-50%",
        background:
          "radial-gradient(circle, rgba(124,58,237,0.18) 0%, rgba(35,193,255,0.08) 35%, transparent 70%)",
        mixBlendMode: "screen",
        filter: "blur(40px)",
      }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  );
}
