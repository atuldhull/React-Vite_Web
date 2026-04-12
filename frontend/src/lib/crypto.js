/**
 * E2EE Crypto Utilities — Web Crypto API
 *
 * Flow:
 *   1. Each user generates an ECDH key pair on first use
 *   2. Public key is uploaded to server, private key stays in IndexedDB
 *   3. To send a message: derive shared secret from (my private + their public)
 *   4. Encrypt message with AES-GCM using derived key
 *   5. Server stores encrypted blob — CANNOT read it
 *   6. Recipient derives same shared secret, decrypts
 *
 * Key storage: IndexedDB (persists across sessions, not accessible to server)
 */

const DB_NAME = "mc_e2ee";
const STORE_NAME = "keys";
const KEY_ID = "my_keypair";

// ═══════════════════════════════════════════════════════════
// IndexedDB helpers
// ═══════════════════════════════════════════════════════════

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ═══════════════════════════════════════════════════════════
// Key Generation (ECDH P-256)
// ═══════════════════════════════════════════════════════════

/**
 * Generate a new ECDH key pair.
 * Public key is exportable (sent to server).
 * Private key is non-extractable (stays in browser).
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // private key NOT extractable
    ["deriveKey"],
  );

  // Export public key as JWK for storage/transport
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  // Store the full key pair in IndexedDB
  await dbSet(KEY_ID, {
    privateKey: keyPair.privateKey, // CryptoKey object (non-extractable)
    publicKey: keyPair.publicKey,
    publicKeyJwk,
  });

  return publicKeyJwk;
}

/**
 * Get existing key pair from IndexedDB, or generate new one.
 * Returns { privateKey: CryptoKey, publicKeyJwk: object }
 */
export async function getOrCreateKeyPair() {
  const existing = await dbGet(KEY_ID);
  if (existing && existing.privateKey && existing.publicKeyJwk) {
    return existing;
  }
  const _publicKeyJwk = await generateKeyPair();
  const stored = await dbGet(KEY_ID);
  return stored;
}

/**
 * Get just the public key JWK (for uploading to server).
 */
export async function getPublicKey() {
  const kp = await getOrCreateKeyPair();
  return kp.publicKeyJwk;
}

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
 * @param {string} plaintext — the message content
 * @param {object} recipientPublicKeyJwk — their public key (from server)
 * @returns {{ encrypted: string, iv: string }} — base64 encoded cipher + IV
 */
export async function encryptMessage(plaintext, recipientPublicKeyJwk) {
  const kp = await getOrCreateKeyPair();
  const sharedKey = await deriveSharedKey(kp.privateKey, recipientPublicKeyJwk);

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
 * @returns {string} — decrypted plaintext
 */
export async function decryptMessage(encryptedBase64, ivBase64, senderPublicKeyJwk) {
  const kp = await getOrCreateKeyPair();
  const sharedKey = await deriveSharedKey(kp.privateKey, senderPublicKeyJwk);

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
