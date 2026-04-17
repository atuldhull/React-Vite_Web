/**
 * Deterministic ECDH keypair derivation from a mnemonic-derived
 * seed. This is what makes "paste your 12 words on a new device
 * and get your old messages back" possible.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The original `crypto.js` used `crypto.subtle.generateKey(ECDH)`
 * which creates a RANDOM keypair per device and stores it non-
 * extractably in IndexedDB. Clear your browser → new random key →
 * old messages become undecryptable because they were encrypted
 * against the prior public key.
 *
 * With this module, the private scalar is deterministically derived
 * from the mnemonic phrase via PBKDF2. Same phrase → same scalar
 * → same keypair → same decryption. The phrase is the identity.
 *
 * WHY A LIBRARY FOR SCALAR MULT
 * ─────────────────────────────
 * Web Crypto can import a P-256 private key from JWK form, but
 * the JWK must include the public `x`/`y` coordinates. To compute
 * those from a raw 32-byte private scalar, you need P-256 scalar
 * multiplication on the curve generator — not something WebCrypto
 * exposes directly. `@noble/curves` (small, audited, zero-dep) is
 * the least-risky way to get a reviewed scalar-mult implementation
 * into the browser without rolling our own.
 *
 * SECURITY
 * ────────
 * - PBKDF2 with 100k iterations + a fixed app-scoped salt. Attackers
 *   who steal a recorded phrase still need to run PBKDF2 to derive
 *   the key; the iteration count slows brute-force.
 * - The derived private scalar is clamped into the valid P-256
 *   range (1 < scalar < n). In the astronomically-unlikely event
 *   PBKDF2 output lands outside that range, we increment and retry
 *   (BIP-32-style). Happens for ~1 in 2^128 seeds — never.
 * - The private scalar is passed to Web Crypto via importKey. The
 *   imported key is marked non-extractable so it can't be leaked
 *   back to JS code after import.
 */

// @ts-check

import { p256 } from "@noble/curves/nist.js";

// Salt constants — kept app-scoped so a phrase derived here never
// matches a phrase someone might use against a different service.
const PBKDF2_SALT = new TextEncoder().encode("mathcollective-identity-v1");
const PBKDF2_ITERATIONS = 100_000;

// ──────────────────────────────────────────────────────────────
// Byte/base64url helpers — JWK uses base64url (RFC 4648 §5).
// ──────────────────────────────────────────────────────────────

/** @param {Uint8Array} bytes @returns {string} */
function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ──────────────────────────────────────────────────────────────
// Core: derive a private scalar from entropy via PBKDF2.
// ──────────────────────────────────────────────────────────────

/**
 * Turn 16 bytes of entropy into a 32-byte private scalar suitable
 * for use as a P-256 private key. Retries with an incrementing
 * counter if the stretched output happens to be out of range
 * (vanishingly rare but specified for determinism).
 *
 * @param {Uint8Array} entropy
 * @returns {Promise<Uint8Array>}
 */
async function deriveScalar(entropy) {
  let counter = 0;
  while (true) {
    const input = new Uint8Array(entropy.length + 1);
    input.set(entropy);
    input[entropy.length] = counter;

    const key = await crypto.subtle.importKey(
      "raw", input, { name: "PBKDF2" }, false, ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: PBKDF2_SALT, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      key, 256,
    );
    const scalar = new Uint8Array(bits);
    if (p256.utils.isValidPrivateKey(scalar)) return scalar;
    counter++; // astronomically unlikely retry path
    if (counter > 255) throw new Error("unable to derive valid scalar"); // unreachable
  }
}

// ──────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────

/**
 * Derive a full ECDH keypair deterministically from entropy.
 *
 * Returns:
 *   - privateKey: a non-extractable WebCrypto CryptoKey (ECDH
 *     deriveKey only — matches the shape the existing chat code
 *     expects from the legacy getOrCreateKeyPair).
 *   - publicKey: the same peer-facing CryptoKey.
 *   - publicKeyJwk: the exportable JWK form that gets uploaded to
 *     the server as the user's public key.
 *   - privateScalar: the 32 raw bytes. Returned so callers can
 *     persist it to IndexedDB as a backup (skipping PBKDF2 on
 *     subsequent loads — ~2s saved per page load).
 *
 * @param {Uint8Array} entropy — 16 bytes from phraseToEntropy
 */
export async function deriveKeypairFromEntropy(entropy) {
  const privateScalar = await deriveScalar(entropy);
  return buildKeypairFromScalar(privateScalar);
}

/**
 * Same as above but skips the PBKDF2 step. Used on subsequent
 * page loads once the private scalar is already cached in
 * IndexedDB from a prior ceremony/restore.
 *
 * @param {Uint8Array} privateScalar — exactly 32 bytes, must be in range
 */
export async function buildKeypairFromScalar(privateScalar) {
  if (privateScalar.length !== 32) throw new Error("private scalar must be 32 bytes");
  if (!p256.utils.isValidPrivateKey(privateScalar)) {
    throw new Error("private scalar out of P-256 range");
  }

  // Uncompressed public point: 0x04 || x || y (65 bytes total).
  const uncompressed = p256.getPublicKey(privateScalar, false);
  const x = uncompressed.slice(1, 33);
  const y = uncompressed.slice(33, 65);

  /** @type {{ kty:"EC", crv:"P-256", d:string, x:string, y:string, ext:boolean }} */
  const privateJwk = {
    kty: "EC", crv: "P-256",
    d: b64urlEncode(privateScalar),
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    ext: true,
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk", privateJwk,
    { name: "ECDH", namedCurve: "P-256" },
    /* extractable: */ false,
    ["deriveKey"],
  );

  const publicKeyJwk = {
    kty: "EC", crv: "P-256",
    x: b64urlEncode(x),
    y: b64urlEncode(y),
    ext: true,
  };
  const publicKey = await crypto.subtle.importKey(
    "jwk", publicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );

  return { privateKey, publicKey, publicKeyJwk, privateScalar };
}
