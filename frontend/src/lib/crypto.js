/**
 * E2EE Crypto Utilities — Web Crypto API
 *
 * Flow (post-Identity-Ceremony):
 *   1. User's keypair is deterministically derived from their 12-word
 *      recovery phrase (see lib/identity/keys.js) and held in memory
 *      by useIdentityStore.
 *   2. To send a message: derive shared secret from (my private +
 *      their public) via ECDH.
 *   3. Encrypt message with AES-GCM using derived key.
 *   4. Server stores encrypted blob — CANNOT read it.
 *   5. Recipient derives the same shared secret independently and
 *      decrypts.
 *
 * This file used to own the keypair (generate + IndexedDB storage).
 * That responsibility has moved to the identity layer — this file is
 * now purely the "math" of encrypt/decrypt. Callers pass their own
 * private key in; we don't hunt for it.
 *
 * The legacy getOrCreateKeyPair / generateKeyPair / getPublicKey
 * helpers have been removed. Any caller that used to invoke them
 * must now read the keypair from useIdentityStore.
 */

// ═══════════════════════════════════════════════════════════
// Shared Secret Derivation
// ═══════════════════════════════════════════════════════════

/**
 * Import a peer's public key from JWK format.
 */
async function importPublicKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

/**
 * Derive a shared AES-GCM key from my private key + their public key.
 * This is the ECDH Diffie-Hellman exchange.
 * Both sides derive the SAME key independently.
 */
async function deriveSharedKey(myPrivateKey, theirPublicKeyJwk) {
  const theirPublicKey = await importPublicKey(theirPublicKeyJwk);

  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ═══════════════════════════════════════════════════════════
// Encrypt / Decrypt Messages
// ═══════════════════════════════════════════════════════════

/**
 * Encrypt a plaintext message for a specific recipient.
 *
 * Callers (ChatPanel) get `myPrivateKey` from useIdentityStore —
 * it's the CryptoKey derived from the user's recovery phrase.
 * Passing it in explicitly (rather than letting this module fetch
 * it) keeps the encryption path a pure function of its inputs.
 *
 * @param {string} plaintext — the message content
 * @param {object} recipientPublicKeyJwk — their public key (from server)
 * @param {CryptoKey} myPrivateKey — the sender's ECDH private key
 * @returns {Promise<{ encrypted: string, iv: string }>} — base64 cipher + IV
 */
export async function encryptMessage(plaintext, recipientPublicKeyJwk, myPrivateKey) {
  if (!myPrivateKey) throw new Error("encryptMessage: myPrivateKey is required");
  const sharedKey = await deriveSharedKey(myPrivateKey, recipientPublicKeyJwk);

  // Random 12-byte IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded,
  );

  return {
    encrypted: bufToBase64(new Uint8Array(cipherBuffer)),
    iv: bufToBase64(iv),
  };
}

/**
 * Decrypt a received message.
 *
 * @param {string} encryptedBase64 — the encrypted content (base64)
 * @param {string} ivBase64 — the IV (base64)
 * @param {object} senderPublicKeyJwk — sender's public key (from server)
 * @param {CryptoKey} myPrivateKey — the receiver's ECDH private key
 * @returns {Promise<string>} — decrypted plaintext
 */
export async function decryptMessage(encryptedBase64, ivBase64, senderPublicKeyJwk, myPrivateKey) {
  if (!myPrivateKey) throw new Error("decryptMessage: myPrivateKey is required");
  const sharedKey = await deriveSharedKey(myPrivateKey, senderPublicKeyJwk);

  const cipherBuffer = base64ToBuf(encryptedBase64);
  const iv = base64ToBuf(ivBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    cipherBuffer,
  );

  return new TextDecoder().decode(decrypted);
}

// ═══════════════════════════════════════════════════════════
// Base64 helpers
// ═══════════════════════════════════════════════════════════

function bufToBase64(buf) {
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}
