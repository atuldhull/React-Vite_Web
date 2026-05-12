import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/app/App";
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import "@/styles/tailwind.css";
import "@/styles/theme.css";
import { registerPwaInstallListeners } from "@/lib/pwaInstall";
import { initSentry } from "@/lib/sentry";

// Init Sentry BEFORE React mounts so errors during initial render
// (auth-store hydration, route resolution, etc.) are captured. No-ops
// without VITE_SENTRY_DSN — see frontend/src/lib/sentry.js.
initSentry();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── PWA: service worker + install-prompt capture ──
// The SW is registered once here; push subscription is set up later
// (after login) in the auth store. The install-prompt listener captures
// the `beforeinstallprompt` event so a user-initiated click can call
// prompt() later — see components/ui/InstallPwaButton.jsx.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/app/sw.js", { scope: "/app/" })
      .then((reg) => console.log("[PWA] SW registered:", reg.scope))
      .catch((err) => console.warn("[PWA] SW failed:", err));
  });
}
registerPwaInstallListeners();
