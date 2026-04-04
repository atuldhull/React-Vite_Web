export const colorTokens = [
  {
    name: "Obsidian",
    token: "--color-obsidian",
    className: "bg-obsidian",
    description: "Primary application backdrop and deep-space foundation.",
  },
  {
    name: "Surface",
    token: "--color-surface",
    className: "bg-surface",
    description: "Main panel layer for immersive glass surfaces.",
  },
  {
    name: "Panel",
    token: "--color-panel",
    className: "bg-panel",
    description: "Elevated interaction layer for cards, modals, and shells.",
  },
  {
    name: "Primary",
    token: "--color-primary",
    className: "bg-primary",
    description: "Signature electric violet for CTA and focus states.",
  },
  {
    name: "Secondary",
    token: "--color-secondary",
    className: "bg-secondary",
    description: "Cyan energy channel for highlights and data accents.",
  },
  {
    name: "Glow",
    token: "--color-glow",
    className: "bg-glow",
    description: "Neon plasma for atmospheric lighting and live signals.",
  },
  {
    name: "Success",
    token: "--color-success",
    className: "bg-success",
    description: "Mint signal for wins, readiness, and positive feedback.",
  },
  {
    name: "Warning",
    token: "--color-warning",
    className: "bg-warning",
    description: "Amber beacon for countdowns, caution, and system prompts.",
  },
];

export const typographyScale = [
  {
    label: "Display / Hero",
    sample: "Immersive interfaces with cinematic presence.",
    className: "font-display text-5xl font-extrabold tracking-[-0.06em] sm:text-6xl",
    usage: "Page heroes, major reveals, signature headings.",
  },
  {
    label: "Section Title",
    sample: "Control panels, missions, and operator dashboards.",
    className: "font-display text-3xl font-bold tracking-[-0.04em] sm:text-4xl",
    usage: "Section anchors and card title clusters.",
  },
  {
    label: "Body / Reading",
    sample: "Structured, readable, and slightly futuristic without feeling cold.",
    className: "text-base font-medium leading-8 text-text-muted sm:text-lg",
    usage: "Descriptions, paragraphs, helper copy, onboarding.",
  },
  {
    label: "Mono / System",
    sample: "STATUS: LIVE    MODE: REBUILD    PHASE: DESIGN-SYSTEM",
    className: "font-mono text-xs uppercase tracking-[0.36em] text-primary/85",
    usage: "Telemetry labels, data chips, timings, technical UI.",
  },
];

export const spacingScale = [
  { name: "2XS", token: "--space-2xs", value: "0.375rem" },
  { name: "XS", token: "--space-xs", value: "0.5rem" },
  { name: "SM", token: "--space-sm", value: "0.75rem" },
  { name: "MD", token: "--space-md", value: "1rem" },
  { name: "LG", token: "--space-lg", value: "1.5rem" },
  { name: "XL", token: "--space-xl", value: "2rem" },
  { name: "2XL", token: "--space-2xl", value: "3rem" },
  { name: "3XL", token: "--space-3xl", value: "4rem" },
];

export const shadowTokens = [
  {
    name: "Orbit",
    token: "--shadow-orbit",
    className: "shadow-orbit",
    description: "Ambient edge glow for premium cards and primary interactions.",
  },
  {
    name: "Panel",
    token: "--shadow-panel",
    className: "shadow-panel",
    description: "Deep layered depth for layout shells and modal planes.",
  },
  {
    name: "Pulse",
    token: "--shadow-pulse",
    className: "shadow-pulse",
    description: "Focused neon bloom for active elements and key signals.",
  },
];
