/**
 * AuroraMesh — animated mesh-gradient backdrop, 100 % CSS.
 *
 * Three soft radial-gradient blobs that drift slowly across the
 * viewport, blending in screen mode for an aurora wash. Sub-1KB,
 * no rAF loop, no canvas, no shader work — just compositor blits
 * driven by CSS keyframes.
 *
 * Use this on error pages, auth pages, simple marketing surfaces
 * where the heavier canvas-based AuroraBackground (with particles)
 * would be overkill.
 *
 * Theme-aware via CSS custom properties; respects
 * prefers-reduced-motion (blobs hold static positions).
 */

const PALETTES = {
  primary:    ["131 82 255", "35 193 255", "110 231 255"],
  city:       ["255 45 120", "124 58 237", "59 130 246"],
  desert:     ["212 160 23", "255 107 53", "124 58 237"],
  pyramid:    ["123 79 224", "59 130 246", "0 207 255"],
  glacier:    ["0 207 255", "59 130 246", "124 58 237"],
  danger:     ["239 68 68", "245 158 11", "124 58 237"],
};

export default function AuroraMesh({ palette = "primary", intensity = 0.4 }) {
  const cols = PALETTES[palette] || PALETTES.primary;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "rgb(var(--color-obsidian))" }}
    >
      <div
        className="absolute aurora-mesh-blob aurora-mesh-blob-a"
        style={{ background: `radial-gradient(circle, rgba(${cols[0]}, ${0.55 * intensity}) 0%, transparent 65%)` }}
      />
      <div
        className="absolute aurora-mesh-blob aurora-mesh-blob-b"
        style={{ background: `radial-gradient(circle, rgba(${cols[1]}, ${0.50 * intensity}) 0%, transparent 65%)` }}
      />
      <div
        className="absolute aurora-mesh-blob aurora-mesh-blob-c"
        style={{ background: `radial-gradient(circle, rgba(${cols[2]}, ${0.50 * intensity}) 0%, transparent 65%)` }}
      />

      {/* Subtle hairline grid for structure */}
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, transparent 80%)",
        }}
      >
        <defs>
          <pattern id="aurora-mesh-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.12" />
          </pattern>
        </defs>
        <g style={{ color: "rgb(var(--color-text-dim))" }}>
          <rect width="100%" height="100%" fill="url(#aurora-mesh-grid)" />
        </g>
      </svg>

      {/* Corner vignette so foreground content stays the focal point. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)" }}
      />

      <style>{`
        .aurora-mesh-blob {
          width: 60vw;
          height: 60vw;
          max-width: 1100px;
          max-height: 1100px;
          filter: blur(60px);
          mix-blend-mode: screen;
          will-change: transform;
        }
        .aurora-mesh-blob-a { top: -10%; left: -10%; animation: auroraMeshA 22s ease-in-out infinite alternate; }
        .aurora-mesh-blob-b { bottom: -15%; right: -15%; animation: auroraMeshB 28s ease-in-out infinite alternate; }
        .aurora-mesh-blob-c { top: 30%; left: 30%; animation: auroraMeshC 26s ease-in-out infinite alternate; }
        @keyframes auroraMeshA { 0% { transform: translate(0, 0)   scale(1);    } 100% { transform: translate( 20vw,  15vh) scale(1.15); } }
        @keyframes auroraMeshB { 0% { transform: translate(0, 0)   scale(1.05); } 100% { transform: translate(-18vw, -12vh) scale(0.92); } }
        @keyframes auroraMeshC { 0% { transform: translate(0, 0)   scale(0.9);  } 100% { transform: translate(-12vw,  20vh) scale(1.10); } }
        @media (prefers-reduced-motion: reduce) {
          .aurora-mesh-blob-a, .aurora-mesh-blob-b, .aurora-mesh-blob-c { animation: none; }
        }
      `}</style>
    </div>
  );
}
