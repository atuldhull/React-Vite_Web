import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import Loader from "@/components/ui/Loader";
import { cn } from "@/lib/cn";

// Magnetic-hover threshold — if the cursor is within this many pixels
// of the button's centre, the button starts following it. Beyond, the
// button stays put. 90 px is a sweet-spot: noticeable on hover, doesn't
// trigger when the cursor is just passing through.
const MAGNET_RANGE = 90;

const sizeMap = {
  sm: "h-10 px-4 text-[11px] tracking-[0.24em]",
  md: "h-12 px-5 text-xs tracking-[0.28em]",
  lg: "h-14 px-6 text-sm tracking-[0.26em]",
};

const variantMap = {
  primary: "border-transparent text-black",
  secondary: "border-transparent bg-transparent",
  ghost: "border-transparent bg-white/[0.03] text-text-muted",
  danger: "border-transparent",
};

const variantStyles = {
  primary: {
    clipPath: "var(--clip-hex)",
    background: "var(--page-accent)",
    color: "rgb(var(--color-obsidian))",
    padding: "var(--space-sm) var(--space-xl)",
  },
  secondary: {
    clipPath: "var(--clip-para)",
    background: "transparent",
    border: "1.5px solid var(--page-accent)",
    color: "var(--page-accent)",
  },
  ghost: {
    clipPath: "var(--clip-para)",
  },
  danger: {
    clipPath: "var(--clip-diamond)",
    minWidth: "120px",
    minHeight: "48px",
    background: "rgba(var(--color-danger), 0.15)",
    color: "rgb(var(--color-danger))",
  },
};

export default function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  leading,
  trailing,
  // Opt-out of the magnetic effect on a per-button basis.
  // Useful inside dense forms where lots of buttons fighting for the
  // cursor would feel jittery, or for very small icon buttons where
  // the offset becomes a hit-target problem.
  magnetic = true,
  ...props
}) {
  const isDisabled = disabled || loading;
  const reduced    = useReducedMotion();
  const ref        = useRef(null);

  // Magnetic-hover offset: motion values driven from a pointermove
  // listener, smoothed via springs so the movement feels weighted
  // rather than jittery. Spring config picked low-stiffness so the
  // button follows the cursor with a slight lag — the hallmark of
  // a "premium" magnetic interaction.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 200, damping: 20, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 200, damping: 20, mass: 0.6 });

  const useMagnet = magnetic && !isDisabled && !reduced;

  const handleMove = (e) => {
    if (!useMagnet || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAGNET_RANGE) {
      mx.set(0); my.set(0);
      return;
    }
    // Pull strength tapers from 100 % at the centre to 0 at the
    // threshold. Cap travel at ~24 px so the button never drifts so
    // far it loses its target affordance.
    const strength = (1 - dist / MAGNET_RANGE) * 0.35;
    mx.set(dx * strength);
    my.set(dy * strength);
  };
  const handleLeave = () => { mx.set(0); my.set(0); };

  return (
    <motion.button
      ref={ref}
      type="button"
      onMouseMove={useMagnet ? handleMove : undefined}
      onMouseLeave={useMagnet ? handleLeave : undefined}
      // Spring on hover gives the button a tactile, slightly bouncy
      // feel instead of the default linear ease. whileTap drops scale
      // a touch more aggressively (0.96 vs 0.985) so the press read
      // is clearer on the new lift+spring combination.
      whileHover={isDisabled ? undefined : {
        scale: 1.02,
        transition: { type: "spring", stiffness: 420, damping: 24 },
      }}
      whileTap={isDisabled ? undefined : {
        scale: 0.96,
        transition: { type: "spring", stiffness: 600, damping: 30 },
      }}
      data-cursor={isDisabled ? undefined : "interactive"}
      className={cn(
        "group relative inline-flex items-center justify-center overflow-hidden border font-mono uppercase transition-all duration-200 ease-in-out hover:shadow-[0_0_16px_var(--page-glow)]",
        sizeMap[size],
        variantMap[variant],
        isDisabled ? "pointer-events-none opacity-55 saturate-50" : "cursor-pointer",
        className,
      )}
      style={{
        // Magnetic offset (motion values) merged with the variant's
        // clipPath / background / colour. Order matters: motion x/y
        // come last so they win if a variant ever set transforms.
        ...(variantStyles[variant] || { clipPath: "var(--clip-para)" }),
        x: useMagnet ? sx : 0,
        y: useMagnet ? sy : 0,
      }}
      disabled={isDisabled}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_48%)] opacity-80" />
      <span className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -skew-x-[18deg] bg-white/15 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-shimmer" />
      <span className="relative z-[1] inline-flex items-center gap-3">
        {loading ? <Loader variant="ring" size="xs" /> : leading}
        <span>{children}</span>
        {!loading ? trailing : null}
      </span>
    </motion.button>
  );
}
