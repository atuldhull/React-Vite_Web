/**
 * InstallPwaButton — shows "Install App" in the header on browsers that
 * support beforeinstallprompt (Chrome/Edge/Samsung Internet) and a small
 * iOS hint ("Add to Home Screen via Share -> Add to Home Screen") on
 * iOS Safari. Hidden entirely if the app is already running in standalone
 * mode or the browser doesn't support installation.
 */

import { useState } from "react";
import {
  usePwaInstallStore,
  isRunningStandalone,
  isIosSafari,
} from "@/lib/pwaInstall";

export default function InstallPwaButton({ className = "" }) {
  const deferredPrompt = usePwaInstallStore((s) => s.deferredPrompt);
  const installed      = usePwaInstallStore((s) => s.installed);
  const promptInstall  = usePwaInstallStore((s) => s.promptInstall);
  const [showIosHint, setShowIosHint] = useState(false);

  // Already running standalone, already installed, or nothing to show
  if (isRunningStandalone() || installed) return null;

  const canPrompt = Boolean(deferredPrompt);
  const ios       = isIosSafari();

  if (!canPrompt && !ios) return null; // nothing we can do

  async function handleClick() {
    if (canPrompt) {
      await promptInstall();
      return;
    }
    if (ios) setShowIosHint((v) => !v);
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className="rounded-full border border-primary/30 bg-primary/12 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white transition hover:bg-primary/20 sm:text-[11px]"
        aria-label="Install Math Collective"
      >
        {"\u2B07"} Install
      </button>

      {showIosHint && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-line/20 bg-surface/95 p-3 text-xs text-text-muted shadow-panel backdrop-blur-2xl">
          <p className="mb-1 font-semibold text-white">Install on iOS</p>
          <p className="leading-5">
            Tap the Share button{" "}
            <span aria-hidden className="mx-0.5 inline-block">{"\u{1F5D2}"}</span>
            then choose <strong className="text-white">Add to Home Screen</strong>.
          </p>
          <button
            onClick={() => setShowIosHint(false)}
            className="mt-2 text-[10px] uppercase tracking-wider text-primary hover:underline"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
