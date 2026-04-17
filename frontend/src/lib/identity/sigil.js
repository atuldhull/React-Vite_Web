/**
 * Sigil derivation — the platform's unique "math-glyph identity".
 *
 * Every user's public key deterministically hashes to a small
 * visual descriptor:
 *   - 4 math symbols arranged in a 2×2 grid
 *   - A foreground hue + a complementary accent hue
 *   - A background hue offset
 *   - A rotation class (0° / 90° / 180° / 270°)
 *
 * Same public key → identical sigil, always. A user who regenerates
 * their keypair (new phrase) gets a visibly different sigil — which
 * doubles as a MITM alarm: if a friend's sigil suddenly changes
 * mid-conversation, you're either talking to someone new or
 * someone's keys got replaced.
 *
 * DESIGN
 * ──────
 * We SHA-256 a canonical form of the public key (JWK stringified
 * with sorted keys) and treat the first 16 bytes as a palette of
 * entropy to drive visual choices. Prime moduli are used for hue
 * selection so the resulting colour space feels "mathematical"
 * rather than uniformly random — a subtle aesthetic nod to the
 * theme.
 *
 * WHY PURE
 * ────────
 * This module has no React, no DOM, no Web Crypto side-effects
 * beyond the one `crypto.subtle.digest` call. It's easy to unit-
 * test and easy to reason about. Rendering lives in IdentityGlyph
 * component (next phase).
 */

// @ts-check

/**
 * Glyph palette — 64 hand-picked math/science/Greek symbols. Kept
 * at 64 (a power of 2) so a single byte of hash material maps to
 * `byte % 64 = byte & 0x3f`. No index bias, clean distribution.
 *
 * Swapping symbols later is SAFE for new users but changes every
 * existing user's sigil. Don't reorder without a version bump +
 * migration plan. (Today it doesn't matter — no real users.)
 */
const GLYPHS = Object.freeze([
  // Operators + comparators
  "∞", "⊕", "⊗", "⊙", "⊘", "⋄", "⊞", "⊠", "≈", "≠", "≡", "≤", "≥", "∝", "∘", "∗",
  // Calculus / differentials
  "∂", "∫", "∬", "∮", "∑", "∏", "∇", "√", "∛", "∜", "⌊", "⌈", "⌋", "⌉", "↦", "→",
  // Greek
  "π", "φ", "Ω", "Δ", "Σ", "Π", "α", "β", "γ", "δ", "λ", "μ", "θ", "ψ", "χ", "ξ",
  // Set theory + logic
  "∈", "∉", "∪", "∩", "∅", "ℝ", "ℂ", "ℤ", "ℕ", "ℚ", "⊂", "⊆", "⊃", "⊇", "∃", "∀",
]);

if (GLYPHS.length !== 64) {
  throw new Error(`[sigil] GLYPHS must have exactly 64 entries, got ${GLYPHS.length}`);
}

/**
 * Canonicalise a JWK into a stable string representation. JWKs are
 * objects with unordered properties; two JSON.stringify calls on
 * the same logical JWK could produce different bytes if keys are
 * inserted in different orders. Sorting keys fixes that — same
 * public key, same hash, same sigil, always.
 *
 * @param {object} jwk
 */
function canonicalJwk(jwk) {
  const keys = Object.keys(jwk).sort();
  const out = /** @type {Record<string, unknown>} */ ({});
  for (const k of keys) out[k] = /** @type {any} */ (jwk)[k];
  return JSON.stringify(out);
}

/**
 * Sigil descriptor shape. Consumed by IdentityGlyph.jsx which
 * renders it into SVG/inline markup.
 *
 * @typedef {{
 *   glyphs: [string, string, string, string],
 *   fgHue: number,
 *   accentHue: number,
 *   bgHue: number,
 *   rotation: 0 | 90 | 180 | 270,
 *   variant: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
 *   short: string,
 * }} Sigil
 */

/**
 * Derive the sigil for a given public key JWK.
 *
 * @param {object} publicKeyJwk
 * @returns {Promise<Sigil>}
 */
export async function deriveSigil(publicKeyJwk) {
  const bytes = new TextEncoder().encode(canonicalJwk(publicKeyJwk));
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const h = new Uint8Array(hashBuf);

  // bytes 0-3: four glyph indices.
  const glyphs = /** @type {[string,string,string,string]} */ ([
    GLYPHS[h[0] & 0x3f],
    GLYPHS[h[1] & 0x3f],
    GLYPHS[h[2] & 0x3f],
    GLYPHS[h[3] & 0x3f],
  ]);

  // Hues — prime-modulo steps for a "mathematical" feel. 360 is
  // deliberately composite; we'd rather land on irrational-ish
  // offsets than perfect thirds.
  const fgHue     = (h[4] * 7) % 360;
  const accentHue = (fgHue + 137) % 360; // golden-angle-ish offset
  const bgHue     = (h[5] * 11) % 360;

  // Rotation — one of 4 quadrants, decided by the low 2 bits of h[6].
  const rotation = /** @type {0|90|180|270} */ ((h[6] & 0b11) * 90);

  // Variant — drives secondary visual elements (border style, etc.).
  // Exposed so the IdentityGlyph component can pick among a small
  // set of frame decorations without re-hashing.
  const variant = /** @type {0|1|2|3|4|5|6|7} */ (h[7] & 0b111);

  // A terse "at-a-glance" string for places that can't render the
  // full 2×2 grid (e.g. a single inline character in a dense table).
  // It's just the first glyph — picked to be stable per user.
  const short = glyphs[0];

  return { glyphs, fgHue, accentHue, bgHue, rotation, variant, short };
}

/**
 * Same-key → same-sigil invariant, but synchronous. Useful in
 * tests that have a pre-hashed sigil input rather than a JWK.
 * Exposed for tests.
 *
 * @param {Uint8Array} first16HashBytes — already-SHA-256'd input
 * @returns {Sigil}
 */
export function sigilFromHashBytes(first16HashBytes) {
  if (first16HashBytes.length < 8) {
    throw new Error("need at least 8 hash bytes");
  }
  const h = first16HashBytes;
  const glyphs = /** @type {[string,string,string,string]} */ ([
    GLYPHS[h[0] & 0x3f],
    GLYPHS[h[1] & 0x3f],
    GLYPHS[h[2] & 0x3f],
    GLYPHS[h[3] & 0x3f],
  ]);
  const fgHue     = (h[4] * 7) % 360;
  const accentHue = (fgHue + 137) % 360;
  const bgHue     = (h[5] * 11) % 360;
  const rotation  = /** @type {0|90|180|270} */ ((h[6] & 0b11) * 90);
  const variant   = /** @type {0|1|2|3|4|5|6|7} */ (h[7] & 0b111);
  return { glyphs, fgHue, accentHue, bgHue, rotation, variant, short: glyphs[0] };
}

export { GLYPHS };
