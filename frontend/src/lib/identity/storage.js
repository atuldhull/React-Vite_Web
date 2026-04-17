/**
 * IndexedDB wrapper for persisted identity material.
 *
 * What lives here:
 *   - `privateScalar` — the 32-byte raw P-256 private key. Stored
 *     as-is because we need it raw to re-derive the public point
 *     on subsequent loads without re-running PBKDF2 (which takes
 *     ~1-2s). Origin-scoped IndexedDB keeps it inaccessible to
 *     other domains.
 *   - `publicKeyJwk` — the JWK that was uploaded to the server.
 *     Cached so we don't have to recompute it on every page load.
 *   - `createdAt` — when the identity was forged, purely for UI
 *     "your identity was created 3 days ago" affordances.
 *
 * What does NOT live here:
 *   - The 12-word phrase itself. NEVER stored. After the ceremony
 *     it exists only in the user's memory / their own password
 *     manager. This is a deliberate choice: if the device is
 *     compromised, the attacker can still send/decrypt messages
 *     going forward (they have the derived key), but they can't
 *     take the identity to another device or service.
 */

// @ts-check

const DB_NAME = "mc_identity_v2";
const STORE = "identity";
const KEY_ID = "current";
const DB_VERSION = 1;

function openDB() {
  return /** @type {Promise<IDBDatabase>} */ (new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/**
 * @typedef {{
 *   privateScalar: Uint8Array,
 *   publicKeyJwk: object,
 *   createdAt: string,
 * }} IdentityBlob
 */

/**
 * @returns {Promise<IdentityBlob | null>}
 */
export async function loadIdentity() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB unavailable (Safari private mode, etc.). Returning
    // null is the right fallback — the UI will prompt for ceremony.
    return null;
  }
}

/**
 * @param {IdentityBlob} blob
 */
export async function saveIdentity(blob) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, KEY_ID);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearIdentity() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY_ID);
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}
