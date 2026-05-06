/**
 * Content filter — banned words / phrases for plaintext channels.
 *
 * Why: announcements, the PANDA chat input, the contact form, and the
 * comment threads all accept free-text from authenticated users.
 * Without a filter, a single bad-actor account can abuse those channels
 * to push slurs, harassment, or illegal-content advertising into shared
 * surfaces — and the legal/ToS exposure is on us.
 *
 * What's NOT filtered here: end-to-end encrypted DMs (messagingController
 * sendMessage + chat.js socket). The server only sees ciphertext —
 * filtering plaintext server-side is structurally impossible. That layer
 * needs a CLIENT-side filter on the DM compose input.
 *
 * Detection is BOUNDARY-AWARE: matches \bword\b only, so "passage",
 * "scunthorpe", "circumstance" don't false-positive on "ass", "cunt",
 * "stance". Compares lowercased haystack against lowercased needles
 * after a normalisation pass that strips zero-width chars and l33t
 * speak (1->i, 0->o, 3->e, @->a, $->s) so trivial obfuscation still
 * trips the filter.
 */

// Keep the list small + curated. Better to under-block and review
// edge cases than to over-block a math student saying "this proof is
// hellish". Extend via env var BANNED_WORDS_EXTRA (comma-separated)
// without redeploying.
const CORE_BANNED = [
  // Slurs — keeping the canonical forms; the normaliser handles l33t.
  "fuck", "fucker", "fucking", "motherfucker",
  "shit", "bullshit",
  "bitch", "bitches",
  "asshole", "asshat",
  "dick", "dickhead",
  "cunt", "twat",
  "bastard",
  "slut", "whore",
  "faggot", "fag",
  "retard", "retarded",
  // Communal slurs — non-exhaustive, intentionally redacted in source
  // via concatenation so a github code-search doesn't flag the file.
  "n" + "i" + "g" + "g" + "e" + "r",
  "n" + "i" + "g" + "g" + "a",
  "ch" + "i" + "n" + "k",
  "k" + "i" + "k" + "e",
  "sp" + "i" + "c",
  // Self-harm — redirect, not just block (frontend should detect this
  // category and show a help-line message instead of a generic error).
  "kys", "kysynot",
];

function getBannedSet() {
  const extra = (process.env.BANNED_WORDS_EXTRA || "")
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...CORE_BANNED, ...extra]);
}

// l33t / homoglyph normaliser. Strips zero-width chars first because
// attackers paste U+200B / U+200C between letters to evade boundary-
// based checks (a string that looks like "fuck" but is actually 7
// chars with invisible separators). Using \u escapes (vs literal
// invisible chars) keeps the source file ASCII-clean.
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060\u00A0]/g;
function normalise(input) {
  return input
    .toLowerCase()
    .replace(ZERO_WIDTH, "")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/5/g, "s")
    // Collapse repeated letters (fuuuck -> fuck). Cap at 1 repeat so
    // legitimate words like "feel" / "see" survive (they have exactly
    // 2 of the letter — collapsing to 1 still matches "fel" / "se"
    // which aren't on the list).
    .replace(/(.)\1{2,}/g, "$1");
}

/**
 * Test if a string contains any banned word (whole-word match after
 * normalisation). Returns the offending word, or null if clean.
 */
export function findBannedWord(text) {
  if (!text || typeof text !== "string") return null;
  const banned = getBannedSet();
  const norm = normalise(text);
  for (const word of banned) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(norm)) return word;
  }
  return null;
}

/**
 * Convenience: returns true if the text is clean (no banned word).
 * Use this at handler boundaries; pair with findBannedWord when the
 * caller wants the offending term for logging.
 */
export function isClean(text) {
  return findBannedWord(text) === null;
}

/**
 * Replace banned words with asterisks of the same length. For places
 * where outright rejection would be too strict (e.g. comments on a
 * public profile — the rest of the text might still be valuable).
 */
export function redact(text) {
  if (!text || typeof text !== "string") return text;
  const banned = getBannedSet();
  let out = text;
  for (const word of banned) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, (m) => "*".repeat(m.length));
  }
  return out;
}

// Exported for the frontend mirror. Don't import this directly into
// frontend code — frontend should keep its own copy under
// frontend/src/lib/content-filter.js to avoid pulling backend bundles
// across the boundary.
export const _CORE_BANNED_FOR_FRONTEND_MIRROR = CORE_BANNED;
