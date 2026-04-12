/**
 * Design Tokens — Centralized constants for UI components
 *
 * Avoids magic numbers scattered across component files.
 * CSS custom properties live in theme.css; these are JS-side constants
 * for component logic that can't be expressed in CSS alone.
 */

// ── Animation ────────────────────────────────────────────
export const ANIMATION = {
  /** Fast micro-interactions (hover, press, focus) */
  fast: { duration: 0.18, ease: "easeOut" },
  /** Standard transitions (panels, toggles) */
  standard: { duration: 0.24, ease: "easeOut" },
  /** Emphasized entrances and exits */
  emphasis: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
  /** Slow ambient loops (breathing, floating) */
  ambient: { duration: 3, ease: "easeInOut" },
  /** Page/monument transitions */
  page: {
    enter: { duration: 0.58, ease: [0.16, 1, 0.3, 1] },
    exit: { duration: 0.22, ease: "easeIn" },
    stagger: 0.08,
  },
};

// ── Z-index layers ───────────────────────────────────────
export const Z_INDEX = {
  background: 0,
  content: 10,
  navigation: 40,
  floating: 50,       // FABs, chat buttons, panda
  overlay: 60,        // modals, drawers
  cursor: 80,         // interactive cursor
  toast: 90,
};

// ── Component sizes ──────────────────────────────────────
export const COMPONENT_SIZE = {
  /** Touch-friendly minimum tap target (WCAG) */
  minTapTarget: 44,
  /** Chat panel width */
  chatPanelWidth: 384,
  chatPanelWidthLg: 420,
  /** Panda bot button */
  pandaButton: 80,
  /** Avatar sizes */
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 56,
};

// ── Breakpoints (matches Tailwind defaults) ──────────────
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

// ── Monument-specific palettes (for JS canvas/3D code) ──
// These are the same values defined in theme.css as CSS vars.
// Canvas/WebGL code can't read CSS vars, so we mirror them here.
export const MONUMENT_COLORS = {
  desert:  { accent: "#D4A017", glow: "rgba(212,160,23,0.15)" },
  pyramid: { accent: "#7B4FE0", glow: "rgba(123,79,224,0.12)" },
  glacier: { accent: "#00CFFF", glow: "rgba(0,207,255,0.12)" },
  jungle:  { accent: "#2ECC71", glow: "rgba(46,204,113,0.10)" },
  city:    { accent: "#FF2D78", glow: "rgba(255,45,120,0.15)" },
  abyss:   { accent: "#00FFC8", glow: "rgba(0,255,200,0.10)" },
  sky:     { accent: "#B695F8", glow: "rgba(182,149,248,0.12)" },
  magma:   { accent: "#FF6B35", glow: "rgba(255,107,53,0.12)" },
};

// ── Event constants ──────────────────────────────────────
export const EVENT = {
  /** Number of early-bird registrations that get bonus XP */
  earlyBirdThreshold: 10,
  /** Top N places that receive winner XP */
  topPlaces: 3,
  /** Winner XP multipliers by rank */
  winnerXpMultipliers: { 1: 1, 2: 0.6, 3: 0.3 },
};
