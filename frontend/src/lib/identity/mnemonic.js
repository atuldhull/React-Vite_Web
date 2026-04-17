/**
 * Mnemonic ↔ seed conversion for the Math Collective identity
 * ceremony. 12-word phrase drawn from a 2048-word math-themed
 * wordlist, deterministically derivable from (and reversible to)
 * a 128-bit entropy seed.
 *
 * DESIGN
 * ──────
 * 2048 words × 11 bits/word × 12 words = 132 bits.
 *   - First 128 bits = entropy (the actual key seed).
 *   - Last 4 bits = checksum (first 4 bits of SHA-256(entropy)) —
 *     catches one-word typos on restore.
 *
 * Pattern mirrors BIP-39 conceptually but uses our own wordlist
 * (see wordlist.js for the rationale).
 *
 * SECURITY NOTES
 * ──────────────
 * - Entropy comes from `crypto.getRandomValues` (CSPRNG). Not from
 *   Math.random, which would be predictable.
 * - The derived AES-GCM key for chat encryption comes from a
 *   PBKDF2 of the entropy with a fixed salt — see crypto.js for
 *   the keypair derivation step. This module ONLY handles the
 *   phrase ↔ entropy bridge.
 * - Checksum validation makes "typed one word wrong" a LOCAL
 *   error — no server round-trip needed for that class of typo.
 *   A phrase that passes the checksum but IS wrong (all words are
 *   valid but in wrong positions) would derive a different key;
 *   the user would see "no messages decrypt" and try again.
 */

// @ts-check

import { WORDLIST } from "./wordlist.js";

const PHRASE_WORDS = 12;
const ENTROPY_BITS = 128;
const CHECKSUM_BITS = 4;
const TOTAL_BITS = ENTROPY_BITS + CHECKSUM_BITS; // 132

// A reverse-lookup map built once at module load. O(1) lookups
// from word → index during phrase validation. The WORDLIST self-
// check at module load already guarantees no duplicates so this
// map is always 1-to-1.
const WORD_TO_INDEX = /** @type {Record<string, number>} */ (
  Object.fromEntries(WORDLIST.map((w, i) => [w, i]))
);

// ──────────────────────────────────────────────────────────────
// Byte ↔ bit-string helpers.
// We operate on bit strings ("0101...") rather than bit-shift maths
// because 132 > 32 and cross-word bit packing with shifts is error-
// prone. Runtime cost is negligible for a one-shot ceremony.
// ──────────────────────────────────────────────────────────────

/** @param {Uint8Array} bytes @returns {string} */
function bytesToBitString(bytes) {
  let out = "";
  for (const b of bytes) out += b.toString(2).padStart(8, "0");
  return out;
}

/** @param {string} bits @returns {Uint8Array} */
function bitStringToBytes(bits) {
  if (bits.length % 8 !== 0) throw new Error("bitString length must be multiple of 8");
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

// ──────────────────────────────────────────────────────────────
// Checksum — first CHECKSUM_BITS of SHA-256(entropy).
// ──────────────────────────────────────────────────────────────

/** @param {Uint8Array} entropy @returns {Promise<string>} */
async function checksumBits(entropy) {
  const hashBuf = await crypto.subtle.digest("SHA-256", entropy);
  return bytesToBitString(new Uint8Array(hashBuf)).slice(0, CHECKSUM_BITS);
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Generate a fresh 12-word phrase from secure random entropy.
 *
 * @returns {Promise<{ phrase: string, entropy: Uint8Array }>}
 *   - phrase: the 12-word space-separated string to show the user
 *   - entropy: the raw 16 bytes (caller passes to crypto.js for
 *     keypair derivation — never shown to the user)
 */
export async function generateMnemonic() {
  const entropy = new Uint8Array(ENTROPY_BITS / 8);
  crypto.getRandomValues(entropy);
  const phrase = await entropyToPhrase(entropy);
  return { phrase, entropy };
}

/**
 * Convert 16 bytes of entropy into a 12-word phrase. Pure.
 * Mainly exported for testability; app code uses generateMnemonic.
 *
 * @param {Uint8Array} entropy
 * @returns {Promise<string>}
 */
export async function entropyToPhrase(entropy) {
  if (entropy.length !== ENTROPY_BITS / 8) {
    throw new Error(`entropy must be ${ENTROPY_BITS / 8} bytes`);
  }
  const bits = bytesToBitString(entropy) + (await checksumBits(entropy));
  if (bits.length !== TOTAL_BITS) throw new Error("bit count mismatch");

  const words = [];
  for (let i = 0; i < PHRASE_WORDS; i++) {
    const chunk = bits.slice(i * 11, (i + 1) * 11);
    const idx = parseInt(chunk, 2);
    words.push(WORDLIST[idx]);
  }
  return words.join(" ");
}

/**
 * Parse a user-pasted phrase back to entropy, validating every word
 * + the checksum. Throws with a specific message on each failure
 * class so the UI can show a helpful hint rather than a generic
 * "invalid phrase".
 *
 * @param {string} phrase
 * @returns {Promise<Uint8Array>}
 */
export async function phraseToEntropy(phrase) {
  const words = phrase.trim().toLowerCase().split(/\s+/);
  if (words.length !== PHRASE_WORDS) {
    throw new Error(`Phrase must be exactly ${PHRASE_WORDS} words (got ${words.length})`);
  }
  const unknown = words.find((w) => !(w in WORD_TO_INDEX));
  if (unknown) {
    throw new Error(`"${unknown}" is not in the Math Collective wordlist — check for typos`);
  }

  let bits = "";
  for (const w of words) bits += WORD_TO_INDEX[w].toString(2).padStart(11, "0");

  const entropyBits = bits.slice(0, ENTROPY_BITS);
  const claimedChecksum = bits.slice(ENTROPY_BITS);

  const entropy = bitStringToBytes(entropyBits);
  const realChecksum = await checksumBits(entropy);
  if (claimedChecksum !== realChecksum) {
    throw new Error(
      "Checksum mismatch — one of your words is probably mistyped. " +
      "Double-check each word against what you saved.",
    );
  }

  return entropy;
}

/**
 * Sanity-check helper for the UI: returns `true` if every word in
 * the user's in-progress phrase is a valid word from the wordlist
 * (but may still fail the full checksum check). Used for per-word
 * turning-red feedback while they type.
 *
 * @param {string} word
 */
export function isWordInWordlist(word) {
  return word.toLowerCase() in WORD_TO_INDEX;
}
