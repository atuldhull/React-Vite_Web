/**
 * EventHero — Cinematic full-viewport entry for the Events page.
 *
 * Structure:
 *   1. Full-screen dark gradient background with floating math symbols
 *   2. Animated title ("Event Timeline") with staggered reveal
 *   3. Live stats (upcoming count, live count, total)
 *   4. CTA button ("Explore Events") that scrolls to timeline
 *   5. Scroll indicator at bottom
 *   6. Fade-out on scroll (parallax)
 *
 * Performance:
 *   - Pure CSS animations for particles (no JS per-frame)
 *   - GPU-composited transforms only (translate, scale, opacity)
 *   - No canvas, no WebGL — just DOM + CSS
 *
 * Motion Timing:
 *   0.0s  — Background gradient fade in
 *   0.3s  — Floating symbols begin drift
 *   0.5s  — Eyebrow text fades up
 *   0.8s  — Main title scales in (1.1 → 1.0)
 *   1.2s  — Subtitle fades up
 *   1.6s  — Stats counter animate in
 *   2.0s  — CTA button scales in
 *   2.5s  — Scroll indicator appears
 */

import { useRef, useEffect, useState, useMemo } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Button from "@/components/ui/Button";

// Floating math symbols — pure CSS animation, no JS
const SYMBOLS = ["∫", "∞", "∑", "π", "Δ", "∂", "φ", "Ω", "√", "λ", "∇", "θ"];

function FloatingSymbols() {
  const particles = useMemo(() =>
    SYMBOLS.map((s, i) => ({
      symbol: s,
      left: `${5 + (i * 8) % 90}%`,
      top: `${10 + (i * 13) % 80}%`,
      size: 14 + (i % 4) * 6,
      duration: 15 + (i % 5) * 4,
      delay: i * 0.8,
      opacity: 0.04 + (i % 3) * 0.02,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute font-mono select-none"
          style={{
            left: p.left,
            top: p.top,
            fontSize: p.size,
            opacity: p.opacity,
            color: "var(--page-accent)",
            animation: `eventSymbolFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        >
          {p.symbol}
        </span>
      ))}
      <style>{`
        @keyframes eventSymbolFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          25% { transform: translateY(-20px) rotate(5deg); }
          75% { transform: translateY(15px) rotate(-3deg); }
        }
      `}</style>
    </div>
  );
}

// Animated counter
function AnimatedCount({ value, delay = 0 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => {
      let start = 0;
      const step = Math.max(1, Math.ceil(value / 30));
      const id = setInterval(() => {
        start += step;
        if (start >= value) { setDisplay(value); clearInterval(id); }
        else setDisplay(start);
      }, 30);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return <span>{display}</span>;
}

export default function EventHero({ stats = {}, onExplore }) {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  // Parallax: fade out + move up as user scrolls
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.6], [0, -80]);
  const scale = useTransform(scrollYProgress, [0, 0.6], [1, 0.95]);

  return (
    <div ref={containerRef} className="relative" style={{ minHeight: "85vh" }}>
      <motion.div
        style={{ opacity, y, scale }}
        className="sticky top-0 flex min-h-[85vh] flex-col items-center justify-center px-4"
      >
        {/* Background gradient */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: "radial-gradient(ellipse at 50% 30%, rgba(46,204,113,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, rgba(0,207,255,0.05) 0%, transparent 40%)",
          }}
        />

        {/* Floating symbols */}
        <FloatingSymbols />

        {/* Accent glow orbs */}
        <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-success/5 blur-[120px] -z-10" />
        <div className="absolute bottom-1/4 right-1/4 h-48 w-48 rounded-full bg-secondary/5 blur-[100px] -z-10" />

        {/* Content */}
        <div className="relative z-10 text-center max-w-3xl mx-auto">
          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="font-mono text-[11px] uppercase tracking-[0.4em] text-secondary"
          >
            Events & Competitions
          </motion.p>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, scale: 1.1, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 font-display text-5xl font-extrabold tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl"
          >
            Event{" "}
            <span className="bg-gradient-to-r from-success via-secondary to-glow bg-clip-text text-transparent">
              Timeline
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 0.6, y: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            className="mt-4 text-lg text-text-muted max-w-xl mx-auto leading-relaxed"
          >
            Live quizzes, hackathons, workshops, and competitions. Register, compete, and climb the ranks.
          </motion.p>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-wrap justify-center gap-8"
          >
            {[
              { label: "Upcoming", value: stats.upcoming || 0, color: "text-secondary" },
              { label: "Live Now", value: stats.live || 0, color: "text-success" },
              { label: "Total Events", value: stats.total || 0, color: "text-primary" },
            ].map((s, i) => (
              <div key={s.label} className="text-center">
                <p className={`math-text text-3xl font-bold ${s.color}`}>
                  <AnimatedCount value={s.value} delay={1800 + i * 200} />
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-text-dim">{s.label}</p>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 2.0, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10"
          >
            <Button size="lg" onClick={onExplore}>
              Explore Events
            </Button>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5, duration: 1.0 }}
          className="absolute bottom-8 flex flex-col items-center gap-2"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-text-dim">
            Scroll to browse
          </span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="h-5 w-px bg-gradient-to-b from-text-dim/30 to-transparent" />
            <div className="mt-px h-2 w-2 rotate-45 border-b border-r border-text-dim/30" />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
