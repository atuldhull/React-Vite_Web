/**
 * PWA install-prompt capture.
 *
 * Chrome-based browsers fire a `beforeinstallprompt` event when the
 * page meets the installability criteria. We must preventDefault() to
 * stop the browser's default mini-infobar and stash the event so a
 * user-initiated click later can call `prompt()`. iOS doesn't fire this
 * event — we detect standalone mode separately and show manual "Add to
 * Home Screen" instructions.
 */

import { create } from "zustand";

export const usePwaInstallStore = create((set, get) => ({
  /** `BeforeInstallPromptEvent` if captured, else null. */
  deferredPrompt: null,

  /** True once the browser reports the app was installed. */
  installed: false,

  setPrompt: (event) => set({ deferredPrompt: event }),

  clearPrompt: () => set({ deferredPrompt: null }),

  markInstalled: () => set({ deferredPrompt: null, installed: true }),

  /**
   * Trigger the native install prompt. Returns the user's choice:
   * 'accepted' | 'dismissed' | 'unavailable'.
   */
  async promptInstall() {
    const event = get().deferredPrompt;
    if (!event) return "unavailable";
    event.prompt();
    const { outcome } = await event.userChoice;
    set({ deferredPrompt: null });
    return outcome;
  },
}));

/**
 * Wire this once at app startup (main.jsx or App.jsx).
 * Idempotent — multiple calls just replace the listeners.
 */
export function registerPwaInstallListeners() {
  if (typeof window === "undefined") return;

  const onBeforeInstallPrompt = (e) => {
    e.preventDefault();                        // suppress default mini-infobar
    usePwaInstallStore.getState().setPrompt(e);
  };

  const onAppInstalled = () => {
    usePwaInstallStore.getState().markInstalled();
    console.log("[PWA] Installed successfully");
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  window.addEventListener("appinstalled", onAppInstalled);
}

/**
 * True iff the app is currently being run as an installed PWA
 * (standalone display mode).
 */
export function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true // iOS legacy
  );
}

/**
 * True iff the current browser is iOS Safari — which is the only
 * scenario where we need to fall back to manual "Add to Home Screen"
 * instructions, because iOS never fires beforeinstallprompt.
 */
export function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}
