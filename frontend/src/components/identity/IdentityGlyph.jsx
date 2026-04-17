/**
 * IdentityGlyph — renders a user's math sigil as a 2×2 grid of
 * glyphs with a unique colour palette. Same public key → identical
 * render, anywhere in the app.
 *
 * USAGE
 * ─────
 *   <IdentityGlyph sigil={sigil} size={48} />
 *   <IdentityGlyph userId={user.id} size={24} inline />
 *
 * When `userId` is given instead of `sigil`, the component fetches
 * the target user's public key via the existing chat.getKey API and
 * computes the sigil client-side. This is what makes the glyph
 * show up next to any name-mention on the platform without the
 * caller needing to pre-compute anything.
 *
 * FALLBACKS
 * ─────────
 * - Sigil not ready yet → render a neutral placeholder square so
 *   row heights don't jump when the hash resolves.
 * - Peer has no public key registered (never opened chat) → same
 *   placeholder. No error — just "user hasn't been to chat yet".
 *
 * VARIANTS
 * ────────
 * The `variant` field (0-7) from the sigil drives a subtle frame
 * decoration:
 *   0-3: plain rounded square
 *   4-5: rounded square with single accent corner
 *   6-7: hexagonal clip-path (matches the app's math-clip theme)
 *
 * INLINE MODE
 * ───────────
 * When `inline={true}`, we render just the `short` glyph (single
 * math symbol) instead of the 2×2 grid. Used in dense lists where
 * a full 48px square wouldn't fit (e.g. leaderboard rows, comment
 * authors).
 */

// @ts-check

import { useEffect, useState } from "react";
import { chat } from "@/lib/api";
import { deriveSigil } from "@/lib/identity/sigil";

const sigilCache = /** @type {Map<string, any>} */ (new Map());

/**
 * @param {{
 *   sigil?: import("@/lib/identity/sigil").Sigil,
 *   userId?: string,
 *   size?: number,
 *   inline?: boolean,
 *   className?: string,
 *   title?: string,
 * }} props
 */
export default function IdentityGlyph({ sigil: sigilProp, userId, size = 40, inline = false, className = "", title }) {
  const [sigil, setSigil] = useState(sigilProp || null);

  useEffect(() => {
    if (sigilProp) { setSigil(sigilProp); return; }
    if (!userId) return;
    if (sigilCache.has(userId)) { setSigil(sigilCache.get(userId)); return; }

    let cancelled = false;
    chat.getKey(userId)
      .then(async (r) => {
        const jwk = r.data?.publicKey || r.data;
        if (!jwk) return;
        const s = await deriveSigil(jwk);
        sigilCache.set(userId, s);
        if (!cancelled) setSigil(s);
      })
      .catch(() => { /* silent — placeholder stays */ });

    return () => { cancelled = true; };
  }, [sigilProp, userId]);

  // Placeholder while loading / unknown.
  if (!sigil) {
    return (
      <span
        className={`inline-block rounded-md bg-line/10 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
        title={title || "Identity not yet forged"}
      />
    );
  }

  const bgColor = `hsl(${sigil.bgHue}, 25%, 14%)`;
  const fgColor = `hsl(${sigil.fgHue}, 75%, 65%)`;
  const accentColor = `hsl(${sigil.accentHue}, 70%, 55%)`;

  // Hexagonal clip for variants 6-7 — matches the app's existing
  // math-clip aesthetic (Button uses --clip-hex).
  const clipStyle = sigil.variant >= 6
    ? "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)"
    : undefined;

  // Corner accent for variants 4-5.
  const cornerAccent = sigil.variant === 4 || sigil.variant === 5;

  // Inline mode — single glyph, smaller footprint.
  if (inline) {
    return (
      <span
        className={`inline-flex items-center justify-center align-middle font-bold ${className}`}
        style={{
          width: size,
          height: size,
          background: bgColor,
          color: fgColor,
          fontSize: size * 0.55,
          borderRadius: clipStyle ? 0 : 6,
          clipPath: clipStyle,
          transform: `rotate(${sigil.rotation}deg)`,
          lineHeight: 1,
        }}
        title={title || `Identity: ${sigil.glyphs.join(" ")}`}
        aria-label={`identity glyph ${sigil.short}`}
      >
        <span style={{ transform: `rotate(-${sigil.rotation}deg)` }}>{sigil.short}</span>
      </span>
    );
  }

  // Full 2×2 grid.
  return (
    <span
      className={`inline-grid grid-cols-2 relative align-middle ${className}`}
      style={{
        width: size,
        height: size,
        background: bgColor,
        borderRadius: clipStyle ? 0 : 8,
        clipPath: clipStyle,
        transform: `rotate(${sigil.rotation}deg)`,
        overflow: "hidden",
      }}
      title={title || `Identity: ${sigil.glyphs.join(" ")}`}
      aria-label={`identity glyph grid ${sigil.glyphs.join(" ")}`}
    >
      {sigil.glyphs.map((g, i) => (
        <span
          key={i}
          className="flex items-center justify-center font-bold"
          style={{
            color: i % 3 === 0 ? accentColor : fgColor,
            fontSize: size * 0.35,
            transform: `rotate(-${sigil.rotation}deg)`,
            lineHeight: 1,
          }}
        >
          {g}
        </span>
      ))}
      {cornerAccent && (
        <span
          aria-hidden
          className="absolute"
          style={{
            width: size * 0.22,
            height: size * 0.22,
            background: accentColor,
            top: 0, right: 0,
            borderBottomLeftRadius: 4,
          }}
        />
      )}
    </span>
  );
}
