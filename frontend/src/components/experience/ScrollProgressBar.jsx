/**
 * ScrollProgressBar — thin reading-progress indicator at the very top
 * of the viewport.
 *
 * Powered by Motion's framer-motion useScroll + useSpring. The scrollX
 * progress (0→1) drives a smooth-spring scaleX transform on a 2px-tall
 * gradient bar fixed to the top of the page. Spring smoothing keeps
 * the bar from twitching on micro-scrolls.
 *
 * Hidden on the homepage where the entire viewport is the Three.js
 * Earth scene — a progress bar there would compete with the scroll-
 * driven choreography. Hide condition: pathname starts with /app/
 * but is exactly the homepage root. Pass-through everywhere else.
 *
 * Mounted once at the app shell level (ExperienceShell) so every page
 * inherits it for free.
 */

import { useScroll, useSpring, motion, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";

const HIDE_PATHS = new Set([
  "/",
  "/app",
  "/app/",
]);

export default function ScrollProgressBar() {
  const { scrollYProgress } = useScroll();
  const reduced = useReducedMotion();
  const location = useLocation();

  // Spring-smoothed scaleX so the bar doesn't twitch on minor scroll
  // jitter. Stiffness/damping picked to feel responsive but never
  // overshoot.
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 32,
    restDelta: 0.001,
  });

  // Skip rendering on homepage so the Three.js scene scroll choreo
  // isn't visually competed with.
  if (HIDE_PATHS.has(location.pathname)) return null;
  if (reduced) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{
        scaleX,
        transformOrigin: "0% 50%",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: "linear-gradient(90deg, var(--page-accent), rgb(var(--color-secondary)))",
        boxShadow: "0 0 8px var(--page-glow)",
        zIndex: 100,
        pointerEvents: "none",
      }}
    />
  );
}
