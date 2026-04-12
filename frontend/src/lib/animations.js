/**
 * Shared framer-motion variants.
 *
 * Extracted from the 11+ page components that each redefined their own
 * `fadeUp` object with subtly different durations/delays — centralizing
 * here keeps animation feel consistent and lets you tune it in one place.
 */

// Standard entrance — slight lift, quick fade. Use for cards/sections.
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5 },
  }),
};

// Hero entrance — more dramatic lift, longer duration. Use for page heroes.
export const fadeUpHero = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

// Scale-in pop — buttons, modals, emphasis panels.
export const scaleIn = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
};

// Horizontal stagger — list items that slide in from the left.
export const slideInLeft = {
  hidden: { opacity: 0, x: -20 },
  visible: (i = 0) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05, duration: 0.4 },
  }),
};
