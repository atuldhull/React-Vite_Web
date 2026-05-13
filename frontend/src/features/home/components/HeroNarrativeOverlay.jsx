/**
 * HeroNarrativeOverlay — scroll-pinned narrative beats over the hero.
 *
 * Sits on top of whichever hero is rendered (the Three.js LibraryScene
 * or the future video-scrub variant), fading one short message in
 * and out as the user scrolls through bands of the 500vh hero spacer.
 *
 * Why bands instead of a continuous scroll-tied effect:
 *   Continuous mappings (opacity proportional to scroll) feel
 *   "scrubby" and never let any single message land. Discrete bands
 *   with explicit fade-in / hold / fade-out cycles give each beat
 *   its own breathing room and read like film title cards.
 *
 * Why rAF + ref-gated setState:
 *   Reading scrollY on every animation frame is cheap, but calling
 *   setState every frame would re-render the whole overlay 60×/sec.
 *   We only setState when the active band INDEX changes (handful of
 *   times per page load), so the React tree stays still between
 *   transitions.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/components/ui/Button";

// Matches the LibraryScene + VideoScrubHero scroll spacer. Kept in
// sync by convention; if the spacer changes in HomePage this needs
// to match. Could refactor to a shared constant later.
function scrollSpan() { return window.innerHeight * 5; }

// Four narrative bands shown sequentially as the user scrolls. The
// first 18% of scroll is reserved for the existing poetic title
// overlay in HomePage, so the bands here start at 0.22.
const BANDS = [
  {
    range:    [0.22, 0.40],
    eyebrow:  "Why we exist",
    headline: "Every breakthrough begins with someone who could think clearly.",
    sub:      "Medicine. Climate. AI. Engineering. Music. Justice. All of it rests on minds we sharpen here.",
  },
  {
    range:    [0.43, 0.62],
    eyebrow:  "Our mission",
    headline: "A generation of relentless problem-solvers.",
    sub:      "We compete, we collaborate, and we push each other harder than any classroom can.",
  },
  {
    range:    [0.65, 0.82],
    eyebrow:  "Every week",
    headline: "Live arenas. Real events. A leaderboard that means something.",
    sub:      "From BMSIT to the world — sharpening together, building together.",
  },
  {
    range:    [0.85, 1.00],
    eyebrow:  "The invitation",
    headline: "If you want to build what comes next,",
    sub:      "you'll find your people here.",
    cta:      { to: "/register", label: "Join the Collective" },
  },
];

export default function HeroNarrativeOverlay() {
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeRef = useRef(-1);
  const rafRef    = useRef(null);

  useEffect(() => {
    // prefers-reduced-motion users skip the rAF loop entirely — we
    // render no message rather than fight against their setting.
    // Reduced motion is checked once at mount; doesn't need to live-
    // update because nobody toggles this OS-level pref mid-session.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;

    const tick = () => {
      const span = scrollSpan();
      const p    = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;

      // Find the active band (or -1 if we're in a gap between bands).
      let next = -1;
      for (let i = 0; i < BANDS.length; i++) {
        if (p >= BANDS[i].range[0] && p < BANDS[i].range[1]) {
          next = i;
          break;
        }
      }

      // Only setState when the band ACTUALLY changes — otherwise we'd
      // re-render the whole tree on every rAF frame.
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActiveIdx(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      // pointer-events-none on the wrapper so the overlay never blocks
      // scroll wheel / touch events from hitting whatever's underneath.
      // The CTA button inside the last band re-enables pointer events
      // for itself so it stays clickable.
      className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-6"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {activeIdx >= 0 && (
          <motion.div
            key={activeIdx}
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={{ opacity: 1, y:  0, filter: "blur(0px)" }}
            exit={{    opacity: 0, y: -20, filter: "blur(8px)" }}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl text-center"
            style={{
              // Strong text-shadow keeps the copy readable over any
              // hero — the bright candle bloom in Three.js or a busy
              // pre-rendered video both have enough luminance to
              // wash out un-shadowed white text.
              textShadow:
                "0 2px 32px rgba(0,0,0,0.85), 0 0 80px rgba(0,0,0,0.55)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[0.42em] text-primary/85 sm:text-sm">
              {BANDS[activeIdx].eyebrow}
            </p>
            <h2 className="mt-5 font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              {BANDS[activeIdx].headline}
            </h2>
            {BANDS[activeIdx].sub && (
              <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
                {BANDS[activeIdx].sub}
              </p>
            )}
            {BANDS[activeIdx].cta && (
              <div className="pointer-events-auto mt-9">
                <Link to={BANDS[activeIdx].cta.to}>
                  <Button size="lg">{BANDS[activeIdx].cta.label}</Button>
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
