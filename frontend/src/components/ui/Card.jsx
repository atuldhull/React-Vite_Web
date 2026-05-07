import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/cn";

const variantMap = {
  glass: "border-line/20 bg-surface/70 shadow-panel",
  glow: "border-primary/25 bg-primary/10 shadow-orbit",
  solid: "border-line/15 bg-panel/80 shadow-panel",
};

export default function Card({
  eyebrow,
  title,
  description,
  variant = "glass",
  interactive = false,
  // When true, skip the scroll-in entrance — useful when a parent
  // already manages a stagger sequence for its children and we don't
  // want a second tween fighting it.
  noEntrance = false,
  // Glassmorphism cursor-tracked spotlight: when on, a soft radial
  // gradient inside the card follows the cursor — same trick used on
  // shadcn-cards / Aceternity / Magic UI. Opt-in to avoid a per-frame
  // CSS variable update on cards where the effect would be wasted.
  spotlight = false,
  footer,
  className,
  children,
  ...props
}) {
  const cardRef = useRef(null);
  const handleSpotlightMove = (e) => {
    if (!spotlight || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty("--spotlight-x", `${e.clientX - rect.left}px`);
    cardRef.current.style.setProperty("--spotlight-y", `${e.clientY - rect.top}px`);
  };
  // prefers-reduced-motion: respect OS-level reduced-motion setting,
  // matching the rest of the app (ExperienceShell already gates Lenis
  // smooth-scroll on this same flag).
  const reduced = useReducedMotion();
  // jsdom (the test environment) doesn't ship IntersectionObserver, and
  // framer-motion's whileInView depends on it. Skip the entrance when
  // the API is missing so the component renders synchronously in unit
  // tests without us having to shim the observer in the test setup.
  const hasIO = typeof window !== "undefined" && typeof window.IntersectionObserver !== "undefined";
  const useEntrance = !noEntrance && !reduced && hasIO;

  // Phase 7: every Card gets a subtle scroll-triggered entrance
  // (opacity + small lift) the FIRST time it enters the viewport.
  // `viewport.once: true` so re-scrolling past doesn't replay it.
  // The values are intentionally small — 14 px lift, 0.55 s duration —
  // so it reads as polish rather than animation theatre, and stacks
  // gracefully under any parent stagger that's already running.
  const entranceProps = useEntrance ? {
    initial: { opacity: 0, y: 14 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-40px" },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  } : {};

  return (
    <motion.article
      ref={cardRef}
      onMouseMove={spotlight && !reduced ? handleSpotlightMove : undefined}
      {...entranceProps}
      // Subtle lift on hover for ALL cards (not just interactive),
      // because passive cards still benefit from a tiny "I see you"
      // response. Interactive cards get a more pronounced movement +
      // scale to signal they're clickable. Reduced-motion users get
      // none of it.
      whileHover={
        reduced ? undefined :
        interactive
          ? { y: -6, scale: 1.012, transition: { type: "spring", stiffness: 360, damping: 22 } }
          : { y: -2,                transition: { duration: 0.22, ease: "easeOut" } }
      }
      data-cursor={interactive ? "interactive" : undefined}
      data-spotlight={spotlight ? "on" : undefined}
      className={cn(
        "group relative overflow-hidden border p-5 backdrop-blur-2xl sm:p-6",
        variantMap[variant],
        interactive ? "will-change-transform" : "",
        className,
      )}
      style={{
        clipPath: "var(--clip-notch)",
        borderTop: "2px solid var(--page-accent)",
      }}
      {...props}
    >
      {/* Cursor-tracked spotlight — a soft radial gradient that follows
          the cursor inside the card. CSS-only (driven by the
          --spotlight-x / --spotlight-y custom properties updated by
          handleSpotlightMove). Always renders when spotlight=on so we
          don't do a per-frame paint on cards that didn't opt in. */}
      {spotlight && !reduced && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(420px circle at var(--spotlight-x, -1000px) var(--spotlight-y, -1000px), rgba(124,58,237,0.18), transparent 60%)",
          }}
        />
      )}
      {/* Notch corner accent triangle */}
      <span
        className="pointer-events-none absolute top-0 right-0 z-[2]"
        style={{
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: "0 20px 20px 0",
          borderColor: "transparent var(--page-accent) transparent transparent",
        }}
      />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <span className="pointer-events-none absolute right-[-3rem] top-[-3rem] h-32 w-32 rounded-full bg-primary/18 blur-3xl transition duration-300 group-hover:scale-125" />

      {eyebrow ? (
        <p className="relative z-[1] font-mono text-[11px] uppercase tracking-[0.32em] text-primary/80">
          {eyebrow}
        </p>
      ) : null}

      {title ? (
        <h3 className="relative z-[1] mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-white">
          {title}
        </h3>
      ) : null}

      {description ? (
        <p className="relative z-[1] mt-3 text-sm leading-7 text-text-muted">
          {description}
        </p>
      ) : null}

      <div className="relative z-[1] mt-5">{children}</div>

      {footer ? <div className="relative z-[1] mt-5">{footer}</div> : null}
    </motion.article>
  );
}
