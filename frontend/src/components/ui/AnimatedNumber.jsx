/**
 * AnimatedNumber — count-up display for stats.
 *
 * Drops in wherever you'd otherwise render a static number. When the
 * component mounts (or `value` changes), it eases the displayed digits
 * from the previous value to the new one over `duration` seconds with
 * an ease-out curve so the count decelerates as it approaches the
 * final number — that "settling" feel is what makes the count read
 * as deliberate rather than a chaotic scramble.
 *
 * Honours prefers-reduced-motion: reduced-motion users see the final
 * number immediately, no animation.
 *
 * Usage:
 *   <AnimatedNumber value={1234} />
 *   <AnimatedNumber value={87} suffix="%" duration={1.2} />
 *   <AnimatedNumber value={null} placeholder="—" />  // graceful when data hasn't loaded
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

function easeOut(t) {
  // Smooth ease-out so count deceleration feels natural. Sine ease-out
  // is gentler than cubic and reads cleaner for numeric counts.
  return 1 - Math.pow(1 - t, 3);
}

function formatThousands(n) {
  // Locale-friendly comma grouping; falls back to plain string if the
  // value isn't finite (rare but possible during loading transitions).
  if (!Number.isFinite(n)) return String(n);
  return Math.round(n).toLocaleString();
}

export default function AnimatedNumber({
  value,
  duration = 1.4,
  suffix = "",
  prefix = "",
  placeholder = "—",
  className,
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(() => (Number.isFinite(value) ? value : 0));
  const fromRef = useRef(0);
  const startRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    // Null / undefined / NaN → just show the placeholder; no animation
    // should run during loading skeletons.
    if (!Number.isFinite(value)) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    if (reduced) {
      setDisplay(value);
      return;
    }

    fromRef.current  = display;
    startRef.current = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = (now) => {
      const t = Math.min(1, (now - startRef.current) / (duration * 1000));
      const eased = easeOut(t);
      const cur = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // `display` deliberately excluded — we sample its current value
    // as `fromRef` once, and tracking it would restart the tween on
    // every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduced]);

  if (!Number.isFinite(value)) {
    return <span className={className}>{placeholder}</span>;
  }
  return <span className={className}>{prefix}{formatThousands(display)}{suffix}</span>;
}
