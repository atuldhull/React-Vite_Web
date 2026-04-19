/**
 * Identity store — the in-memory source of truth for the current
 * user's chat identity (keys + sigil).
 *
 * STATES
 * ──────
 *   unknown  — haven't checked IndexedDB yet (initial load)
 *   missing  — no identity found; UI should prompt for ceremony
 *   ready    — keys loaded + sigil derived; chat can encrypt
 *   forging  — ceremony in progress (showing phrase to user)
 *   restoring — user is pasting a phrase
 *
 * The single pointer from the UI back here is `useIdentityStore(s => s.status)`.
 * ChatPanel + ChatButton gate their own behaviour on it.
 */

// @ts-check

import { create } from "zustand";
import { buildKeypairFromScalar, deriveKeypairFromEntropy } from "@/lib/identity/keys";
import { deriveSigil } from "@/lib/identity/sigil";
import { loadIdentity, saveIdentity, clearIdentity } from "@/lib/identity/storage";
import { generateMnemonic, phraseToEntropy } from "@/lib/identity/mnemonic";
import { chat as chatApi } from "@/lib/api";

/**
 * @typedef {"unknown" | "missing" | "ready" | "forging" | "restoring"} IdentityStatus
 */

export const useIdentityStore = create((set, get) => ({
  /** @type {IdentityStatus} */
  status: "unknown",

  /** @type {CryptoKey | null} */
  privateKey: null,
  /** @type {object | null} */
  publicKeyJwk: null,
  /** @type {import("@/lib/identity/sigil").Sigil | null} */
  sigil: null,

  /**
   * Transient phrase, only set while the ceremony modal is open.
   * Cleared after the user confirms they've saved it. Never
   * persisted, never logged.
   * @type {string | null}
   */
  pendingPhrase: null,

  /**
   * Derived keypair material held between startCeremony + confirmCeremony
   * so we don't re-run the PBKDF2 round-trip. Declared here so @ts-check
   * doesn't flag the later set({_pendingScalar: ...}) calls as writes
   * to undeclared properties.
   * @type {Uint8Array | null}
   */
  _pendingScalar: null,
  /** @type {CryptoKey | null} */
  _pendingPrivateKey: null,
  /** @type {object | null} */
  _pendingPublicJwk: null,

  /** Last error to surface in modals — cleared when the user dismisses. */
  /** @type {string | null} */
  error: null,

  /**
   * Set when the public key failed to sync to the server (hydrate-time
   * republish). Local identity still works — only inbound messaging
   * is affected, because nobody else can fetch our key to encrypt to.
   * ChatPanel shows a banner + manual retry when this is populated.
   * @type {string | null}
   */
  serverSyncError: null,

  /**
   * Called once on app boot (after the user is authenticated).
   * Reads IndexedDB → hydrates the store → status becomes ready/missing.
   */
  hydrate: async () => {
    if (get().status !== "unknown") return;
    try {
      const blob = await loadIdentity();
      if (!blob) {
        set({ status: "missing" });
        return;
      }
      const { privateKey, publicKeyJwk } = await buildKeypairFromScalar(blob.privateScalar);
      const sigil = await deriveSigil(publicKeyJwk);
      set({ status: "ready", privateKey, publicKeyJwk, sigil, serverSyncError: null });
      // Self-heal the "key saved locally but never reached the server"
      // case (happens when the original confirmCeremony succeeded on
      // IndexedDB but the subsequent registerKey call lost the network
      // race or — the root of the current "User A can send but B can't
      // receive" bug — the backend swallowed an upsert error and lied
      // about success). Strategy: check whether our userId already has
      // a key on the server; if not, register + verify it actually
      // landed by re-fetching. 3 retries with exponential backoff
      // handle transient network flakes without spamming the API.
      syncPublicKeyToServer(get, set);
    } catch (err) {
      const e = /** @type {Error} */ (err);
      set({ status: "missing", error: e instanceof Error ? e.message : "Hydration failed" });
    }
  },

  /**
   * Step 1 of the ceremony — generate a fresh phrase and show it.
   * Does NOT persist anything yet; the user must explicitly confirm
   * they've saved the phrase before we commit.
   */
  startCeremony: async () => {
    // Diagnostic logging — temporary, until we've confirmed the
    // ceremony flow works end-to-end on every device the app has
    // been deployed to. Prefixed with [identity] so devtools filter
    // can isolate them.
    console.log("[identity] startCeremony: entering");
    set({ status: "forging", error: null });
    try {
      console.log("[identity] startCeremony: generating mnemonic…");
      const { phrase, entropy } = await generateMnemonic();
      console.log("[identity] startCeremony: phrase generated (12 words, entropy %d bytes)", entropy.length);
      set({ pendingPhrase: phrase });
      // Stash the derived-but-unpersisted keypair so the confirm
      // step doesn't re-run PBKDF2 (~1s saved).
      console.log("[identity] startCeremony: deriving keypair (PBKDF2 100k iterations — ~1-2s)…");
      const derived = await deriveKeypairFromEntropy(entropy);
      console.log("[identity] startCeremony: keypair derived — ready for confirm");
      set({
        _pendingScalar: derived.privateScalar,
        _pendingPrivateKey: derived.privateKey,
        _pendingPublicJwk: derived.publicKeyJwk,
      });
    } catch (err) {
      console.error("[identity] startCeremony FAILED:", err);
      // Previously the catch set status back to "missing" but left
      // pendingPhrase populated (it had been set before the throw
      // from deriveKeypairFromEntropy). That left the UI in an
      // unrenderable state — the intro branch requires !pendingPhrase,
      // the phrase-grid branch requires status==="forging", and the
      // forging-spinner branch requires !pendingPhrase. Nothing
      // matched and the modal went completely empty except for the
      // X close button. Reset the whole transient ceremony state so
      // the user lands back on the intro with a visible error banner.
      set({
        status:          "missing",
        pendingPhrase:   null,
        _pendingScalar:  null,
        _pendingPrivateKey: null,
        _pendingPublicJwk:  null,
        error: err instanceof Error ? err.message : "Ceremony failed",
      });
    }
  },

  /**
   * Step 2 — the user has saved their phrase and clicked "I've saved
   * it, forge my identity". Persist to IndexedDB, upload public key,
   * derive sigil, flip to ready.
   */
  confirmCeremony: async () => {
    const s = get();
    if (!s._pendingScalar || !s._pendingPublicJwk) {
      set({ error: "Ceremony state missing — start again" });
      return;
    }
    try {
      await saveIdentity({
        privateScalar: s._pendingScalar,
        publicKeyJwk: s._pendingPublicJwk,
        createdAt: new Date().toISOString(),
      });
      await chatApi.registerKey(s._pendingPublicJwk);
      const sigil = await deriveSigil(s._pendingPublicJwk);
      set({
        status: "ready",
        privateKey: s._pendingPrivateKey,
        publicKeyJwk: s._pendingPublicJwk,
        sigil,
        pendingPhrase: null,
        _pendingScalar: null,
        _pendingPrivateKey: null,
        _pendingPublicJwk: null,
        error: null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Could not save identity" });
    }
  },

  /** Cancel an in-progress ceremony without persisting anything. */
  cancelCeremony: () => set({
    status: "missing",
    pendingPhrase: null,
    _pendingScalar: null,
    _pendingPrivateKey: null,
    _pendingPublicJwk: null,
    error: null,
  }),

  /**
   * Restore an identity from a user-pasted phrase. Validates via
   * phraseToEntropy (which enforces wordlist + checksum), then
   * derives keys and persists.
   *
   * @param {string} phrase
   */
  restoreFromPhrase: async (phrase) => {
    set({ status: "restoring", error: null });
    try {
      const entropy = await phraseToEntropy(phrase);
      const { privateKey, publicKeyJwk, privateScalar } = await deriveKeypairFromEntropy(entropy);
      await saveIdentity({
        privateScalar,
        publicKeyJwk,
        createdAt: new Date().toISOString(),
      });
      await chatApi.registerKey(publicKeyJwk);
      const sigil = await deriveSigil(publicKeyJwk);
      set({ status: "ready", privateKey, publicKeyJwk, sigil, error: null });
    } catch (err) {
      // Match startCeremony's full-reset on failure — leave no
      // half-populated state that would render the modal unrenderable.
      set({
        status:          "missing",
        pendingPhrase:   null,
        _pendingScalar:  null,
        _pendingPrivateKey: null,
        _pendingPublicJwk:  null,
        error: err instanceof Error ? err.message : "Restore failed",
      });
    }
  },

  /**
   * Nuclear option — clear identity from this device. Useful for
   * testing + eventual "log out of chat on this device" UX.
   */
  forget: async () => {
    await clearIdentity();
    set({
      status: "missing",
      privateKey: null,
      publicKeyJwk: null,
      sigil: null,
      pendingPhrase: null,
      error: null,
    });
  },

  /** Manually clear the error banner. */
  clearError: () => set({ error: null }),

  /**
   * Retry the server-side public-key upload after a hydrate-time
   * failure. Called from the ChatPanel banner when serverSyncError
   * is set.
   */
  retryServerSync: async () => {
    await syncPublicKeyToServer(get, set);
  },
}));

/**
 * Publish the current user's public key to the server with retry and
 * exponential backoff on transient failures (up to 3 attempts, 500ms /
 * 1000ms between). Non-retriable 4xx errors (401/403/bad request) fail
 * fast. The backend now verifies the upsert landed before returning
 * success, so a 200 here is authoritative.
 *
 * Previously this was a single fire-and-forget POST that console.warn'd
 * on failure and left the user stuck — the root of the "User A can
 * send but B can't receive" report, once the backend was also fixed
 * to stop reporting false positives on failed upserts.
 *
 * @param {() => any} get
 * @param {(patch: any) => void} set
 */
async function syncPublicKeyToServer(get, set) {
  const jwk = get().publicKeyJwk;
  if (!jwk) return;

  const maxAttempts = 3;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await chatApi.registerKey(jwk);
      set({ serverSyncError: null });
      return;
    } catch (err) {
      const e = /** @type {any} */ (err);
      lastErr = e;
      const status = e?.response?.status;
      const is4xx = typeof status === "number" && status >= 400 && status < 500;
      // 4xx is non-retriable — backoff won't help (bad payload, CSRF,
      // session expired). Bubble the error immediately.
      if (is4xx) break;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  const e = /** @type {any} */ (lastErr);
  const msg = e?.response?.data?.error || e?.message || "Could not sync key to server";
  console.warn("[identity] server key republish failed after retries:", msg);
  set({ serverSyncError: msg });
}
