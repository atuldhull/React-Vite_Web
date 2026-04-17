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

  /** Last error to surface in modals — cleared when the user dismisses. */
  /** @type {string | null} */
  error: null,

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
      set({ status: "ready", privateKey, publicKeyJwk, sigil });
      // Best-effort republish public key to server (in case the user
      // switched devices; the new copy still points at the same key
      // because the derivation is deterministic).
      chatApi.registerKey(publicKeyJwk).catch(() => {});
    } catch (err) {
      set({ status: "missing", error: err instanceof Error ? err.message : "Hydration failed" });
    }
  },

  /**
   * Step 1 of the ceremony — generate a fresh phrase and show it.
   * Does NOT persist anything yet; the user must explicitly confirm
   * they've saved the phrase before we commit.
   */
  startCeremony: async () => {
    set({ status: "forging", error: null });
    try {
      const { phrase, entropy } = await generateMnemonic();
      set({ pendingPhrase: phrase });
      // Stash the derived-but-unpersisted keypair so the confirm
      // step doesn't re-run PBKDF2 (~1s saved).
      const derived = await deriveKeypairFromEntropy(entropy);
      set({
        _pendingScalar: derived.privateScalar,
        _pendingPrivateKey: derived.privateKey,
        _pendingPublicJwk: derived.publicKeyJwk,
      });
    } catch (err) {
      set({
        status: "missing",
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
      set({
        status: "missing",
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
}));
