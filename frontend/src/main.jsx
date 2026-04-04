import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/app/App";
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import "@/styles/tailwind.css";
import "@/styles/theme.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register PWA service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/app/sw.js", { scope: "/app/" })
      .then((reg) => console.log("[PWA] SW registered:", reg.scope))
      .catch((err) => console.warn("[PWA] SW failed:", err));
  });
}
