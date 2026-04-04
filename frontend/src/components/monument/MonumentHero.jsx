/**
 * MonumentHero — Premium animated page header per monument.
 *
 * Each monument gets a unique visual identity:
 *   - Zoom-in entrance animation (scale 1.3→1.0 over 1.2s)
 *   - Multi-layer parallax depth (3 layers at different speeds)
 *   - Animated math symbols floating in the background
 *   - Monument-specific gradient, particles, and geometry
 *   - Frosted glass content overlay
 *
 * Usage:
 *   <MonumentHero monument="desert" title="The Arena" subtitle="Challenge Zone" />
 */

import { useRef, useEffect, useMemo } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

// ═══════════════════════════════════════════════════════════
// MONUMENT VISUAL CONFIGS
// ═══════════════════════════════════════════════════════════

const HERO_CONFIGS = {
  desert: {
    gradient: "radial-gradient(ellipse at 30% 80%, #3d1f00 0%, #1a0800 40%, #0a0400 100%)",
    symbols: ["∑", "∫", "π", "φ", "∞", "Δ", "∂", "√"],
    particleColor: "#D4A017",
    glowColor: "rgba(212,160,23,0.15)",
    accentGradient: "linear-gradient(135deg, #D4A017, #FF8C00)",
    monumentShape: "pyramid", // CSS shape type
  },
  pyramid: {
    gradient: "radial-gradient(ellipse at 50% 20%, #1a0050 0%, #080020 40%, #030010 100%)",
    symbols: ["∫", "△", "∇", "λ", "e", "i", "∑", "π"],
    particleColor: "#7B4FE0",
    glowColor: "rgba(123,79,224,0.15)",
    accentGradient: "linear-gradient(135deg, #7B4FE0, #B695F8)",
    monumentShape: "crystal",
  },
  glacier: {
    gradient: "linear-gradient(180deg, #001428 0%, #002244 30%, #001835 100%)",
    symbols: ["ε", "∞", "lim", "→", "∮", "Σ", "δ", "θ"],
    particleColor: "#00CFFF",
    glowColor: "rgba(0,207,255,0.12)",
    accentGradient: "linear-gradient(135deg, #00CFFF, #0088FF)",
    monumentShape: "spire",
  },
  jungle: {
    gradient: "radial-gradient(ellipse at 70% 90%, #002a0a 0%, #001208 40%, #000a04 100%)",
    symbols: ["∞", "φ", "√", "∫", "Ω", "∂", "π", "e"],
    particleColor: "#2ECC71",
    glowColor: "rgba(46,204,113,0.12)",
    accentGradient: "linear-gradient(135deg, #2ECC71, #00B894)",
    monumentShape: "temple",
  },
  city: {
    gradient: "linear-gradient(180deg, #04000f 0%, #0a0020 50%, #04000f 100%)",
    symbols: ["λ", "⊢", "⊨", "∀", "∃", "¬", "∧", "∨"],
    particleColor: "#FF2D78",
    glowColor: "rgba(255,45,120,0.15)",
    accentGradient: "linear-gradient(135deg, #FF2D78, #00D4FF)",
    monumentShape: "tower",
  },
  abyss: {
    gradient: "radial-gradient(ellipse at 50% 30%, #001f3a 0%, #000d1a 50%, #000508 100%)",
    symbols: ["∂", "Ω", "∮", "∇", "∫", "dx", "∞", "ℂ"],
    particleColor: "#00FFC8",
    glowColor: "rgba(0,255,200,0.1)",
    accentGradient: "linear-gradient(135deg, #00FFC8, #0088AA)",
    monumentShape: "arch",
  },
  sky: {
    gradient: "linear-gradient(160deg, #0f0025 0%, #1a0840 30%, #0a0520 100%)",
    symbols: ["φ", "ψ", "Ω", "∫", "f(x)", "Δ", "∑", "π"],
    particleColor: "#B695F8",
    glowColor: "rgba(182,149,248,0.12)",
    accentGradient: "linear-gradient(135deg, #B695F8, #8B5CF6)",
    monumentShape: "floating",
  },
  magma: {
    gradient: "radial-gradient(ellipse at 50% 100%, #200800 0%, #100200 50%, #050000 100%)",
    symbols: ["∀", "∃", "⊢", "⊨", "⊥", "⊤", "∇", "∧"],
    particleColor: "#FF6B35",
    glowColor: "rgba(255,107,53,0.12)",
    accentGradient: "linear-gradient(135deg, #FF6B35, #FF2200)",
    monumentShape: "forge",
  },
};

// ═══════════════════════════════════════════════════════════
// MONUMENT SHAPE SILHOUETTES (CSS-only, unique per monument)
// ═══════════════════════════════════════════════════════════

function MonumentSilhouette({ shape, color }) {
  const baseStyle = {
    position: "absolute",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    opacity: 0.06,
    pointerEvents: "none",
  };

  switch (shape) {
    case "pyramid":
      return (
        <div style={{ ...baseStyle, width: 0, height: 0, borderLeft: "200px solid transparent", borderRight: "200px solid transparent", borderBottom: `300px solid ${color}` }} />
      );
    case "crystal":
      return (
        <div style={{ ...baseStyle, bottom: -20 }}>
          <div style={{ width: 0, height: 0, borderLeft: "120px solid transparent", borderRight: "120px solid transparent", borderBottom: `250px solid ${color}`, margin: "0 auto" }} />
          <div style={{ width: 0, height: 0, borderLeft: "80px solid transparent", borderRight: "80px solid transparent", borderBottom: `180px solid ${color}`, position: "absolute", left: "50%", bottom: 0, transform: "translateX(-50%) translateX(100px)" }} />
        </div>
      );
    case "spire":
      return (
        <div style={{ ...baseStyle, display: "flex", gap: "30px", alignItems: "flex-end" }}>
          {[180, 280, 220, 160, 120].map((h, i) => (
            <div key={i} style={{ width: 12 + i * 2, height: h, background: color, borderRadius: "4px 4px 0 0" }} />
          ))}
        </div>
      );
    case "temple":
      return (
        <div style={{ ...baseStyle, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 60, height: 100, background: color, borderRadius: "4px 4px 0 0" }} />
          <div style={{ width: 200, height: 40, background: color }} />
          <div style={{ width: 300, height: 30, background: color }} />
        </div>
      );
    case "tower":
      return (
        <div style={{ ...baseStyle, display: "flex", gap: "8px", alignItems: "flex-end" }}>
          {[60, 90, 140, 200, 300, 180, 120, 70, 100, 160, 80].map((h, i) => (
            <div key={i} style={{ width: 20 + Math.random() * 15, height: h, background: color, borderRadius: "2px 2px 0 0" }} />
          ))}
        </div>
      );
    case "arch":
      return (
        <div style={{ ...baseStyle, width: 300, height: 200, borderRadius: "150px 150px 0 0", border: `3px solid ${color}`, borderBottom: "none" }} />
      );
    case "floating":
      return (
        <div style={{ ...baseStyle, bottom: 80, display: "flex", gap: "60px" }}>
          {[40, 60, 35].map((h, i) => (
            <div key={i} style={{ width: 80 + i * 30, height: h, background: color, borderRadius: "8px", transform: `translateY(${i * 20}px)` }} />
          ))}
        </div>
      );
    case "forge":
      return (
        <div style={{ ...baseStyle, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 0, height: 0, borderLeft: "150px solid transparent", borderRight: "150px solid transparent", borderBottom: `200px solid ${color}` }} />
          <div style={{ width: 120, height: 60, background: color, marginTop: -2 }} />
        </div>
      );
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════
// FLOATING MATH SYMBOLS (parallax layer)
// ═══════════════════════════════════════════════════════════

function FloatingSymbols({ symbols, color }) {
  const placements = useMemo(() => {
    return symbols.map((sym, i) => ({
      sym,
      left: `${10 + (i * 11) % 80}%`,
      top: `${15 + (i * 17) % 60}%`,
      size: 1.5 + (i % 3) * 0.8,
      duration: 8 + (i % 5) * 2,
      delay: i * 0.5,
    }));
  }, [symbols]);

  return (
    <>
      {placements.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: [0.04, 0.12, 0.04],
            y: [0, -30, 0],
            rotate: [0, 10, -5, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="math-text pointer-events-none absolute select-none"
          style={{
            left: p.left,
            top: p.top,
            fontSize: `${p.size}rem`,
            color,
            textShadow: `0 0 20px ${color}40`,
          }}
        >
          {p.sym}
        </motion.span>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

/**
 * MonumentHero — Premium animated header for any page.
 *
 * @param {string} monument - Monument ID (desert, pyramid, glacier, etc.)
 * @param {string} title - Page title (e.g. "The Arena")
 * @param {string} subtitle - Small label above title
 * @param {string} description - Optional description text
 * @param {React.ReactNode} children - Optional extra content (buttons, stats)
 */
export default function MonumentHero({
  monument = "desert",
  title,
  subtitle,
  description,
  children,
}) {
  const config = HERO_CONFIGS[monument] || HERO_CONFIGS.desert;
  const ref = useRef(null);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  // Parallax transforms
  const bgY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const symbolsY = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const contentY = useTransform(scrollYProgress, [0, 1], [0, -20]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <motion.section
      ref={ref}
      initial={{ scale: 1.15, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "45vh",
        display: "flex",
        alignItems: "flex-end",
        paddingBottom: "3rem",
      }}
    >
      {/* Layer 1: Background gradient (parallax slow) */}
      <motion.div
        style={{
          position: "absolute",
          inset: 0,
          background: config.gradient,
          y: bgY,
        }}
      />

      {/* Layer 2: Monument silhouette */}
      <MonumentSilhouette shape={config.monumentShape} color={config.particleColor} />

      {/* Layer 3: Floating math symbols (parallax medium) */}
      <motion.div style={{ position: "absolute", inset: 0, y: symbolsY, opacity }}>
        <FloatingSymbols symbols={config.symbols} color={config.particleColor} />
      </motion.div>

      {/* Layer 4: Accent glow orb */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "40vw",
          height: "40vh",
          background: config.glowColor,
          filter: "blur(80px)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      {/* Layer 5: Bottom fade */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "50%",
          background: "linear-gradient(to top, rgb(var(--color-obsidian)), transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Layer 6: Content (parallax fast — moves against scroll) */}
      <motion.div
        style={{ position: "relative", zIndex: 3, width: "100%", y: contentY }}
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          {subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="font-mono text-xs uppercase tracking-[0.3em]"
              style={{ color: config.particleColor }}
            >
              {subtitle}
            </motion.p>
          )}

          {title && (
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3 text-4xl font-extrabold tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                textShadow: `0 0 40px ${config.glowColor}`,
              }}
            >
              {title}
            </motion.h1>
          )}

          {description && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="mt-4 max-w-xl text-text-muted"
            >
              {description}
            </motion.p>
          )}

          {children && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="mt-6"
            >
              {children}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.section>
  );
}
