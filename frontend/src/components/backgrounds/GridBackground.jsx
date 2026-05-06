/**
 * GridBackground — clean professional dashboard backdrop.
 *
 * Replaces MatrixBackground (the busy katakana-rain canvas) on the
 * admin / teacher / super-admin layouts. A canvas animation that runs
 * a render loop on every frame is the wrong default for surfaces a
 * teacher stares at for an hour while grading — it costs battery, it
 * reduces contrast on the surrounding cards, and it's what the audit
 * flagged as "very busy and low contrast in light mode".
 *
 * What this gives instead:
 *   - A static SVG topology grid (radial fade so cards in the middle
 *     get clean dark backdrop, edges stay subtle)
 *   - A few fixed glow accents in the brand palette (no animation,
 *     pure CSS gradient — zero CPU)
 *   - Light/dark adaptive — uses CSS custom properties so flipping
 *     theme just re-resolves the colours, no re-render
 *
 * No canvas, no requestAnimationFrame, no GC pressure. Renders once.
 */

export default function GridBackground({ accent = "primary" }) {
  const ACCENTS = {
    primary:    { a: "#7c3aed", b: "#3b82f6" }, // teacher
    success:    { a: "#10b981", b: "#06b6d4" }, // admin
    super:      { a: "#f59e0b", b: "#ef4444" }, // super-admin
  };
  const tone = ACCENTS[accent] || ACCENTS.primary;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        // --color-obsidian flips per theme (defined in theme.css):
        //   dark:    rgb(8, 10, 20)         — deep slate
        //   light:   rgb(248, 249, 252)     — paper
        //   eclipse: rgb(5, 6, 14)          — almost-black
        // Using the var means flipping theme repaints once with no JS.
        background: "rgb(var(--color-obsidian))",
      }}
    >
      {/* Topology grid — SVG pattern. 40px squares, hairline stroke,
          radial mask so it fades toward the edges (keeps cards in the
          centre on a clean canvas instead of a noisy chessboard). */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          // Mask: full opacity in centre, fades to 0 at corners.
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)",
        }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            {/* Light mode: dark hairlines on light bg. Dark mode: light
                hairlines on dark bg. currentColor flips via CSS. */}
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.18" />
          </pattern>
          <pattern id="grid-bold" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.28" />
          </pattern>
        </defs>
        {/* color-mix lets us reuse the per-theme text-dim hue at low
            alpha. Falls back to a fixed dim slate for browsers without
            color-mix support (Safari < 16.4 — vanishingly rare in 2026). */}
        <g style={{ color: "rgb(var(--color-text-dim))" }}>
          <rect width="100%" height="100%" fill="url(#grid)" />
          <rect width="100%" height="100%" fill="url(#grid-bold)" />
        </g>
      </svg>

      {/* Two soft accent glows — one upper-left, one lower-right. Pure
          radial gradients, no animation. Gives the page some warmth
          without the canvas-rain busyness. */}
      <div
        className="absolute"
        style={{
          top: "-15%", left: "-10%", width: "55vw", height: "55vw",
          background: `radial-gradient(circle, ${tone.a}22 0%, transparent 60%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute"
        style={{
          bottom: "-15%", right: "-10%", width: "55vw", height: "55vw",
          background: `radial-gradient(circle, ${tone.b}22 0%, transparent 60%)`,
          filter: "blur(40px)",
        }}
      />

      {/* Subtle vignette — darkens the very corners so peripheral
          content (toasts, modals) feels framed. */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)",
        }}
      />
    </div>
  );
}
