/**
 * MonumentRouter — Integrates the 3D monument system with React Router.
 *
 * Reads the current pathname, maps it to a monument ID, and:
 *   1. Sets data-monument attribute on body (CSS variable system)
 *   2. Optionally renders the 3D MonumentScene as a fixed background
 *   3. Triggers ambient audio for the current monument
 *   4. Provides monument context to all children
 *
 * Usage: Wrap inside BrowserRouter, around the Routes:
 *   <BrowserRouter>
 *     <MonumentRouter>
 *       <Routes>...</Routes>
 *     </MonumentRouter>
 *   </BrowserRouter>
 *
 * NOTE: The 3D canvas is opt-in via the `enable3D` prop.
 * When disabled (default for now), only the CSS variable system
 * and data-monument attribute are applied — existing 2D monument
 * backgrounds continue to work.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMonumentForPath, getMonument } from "@/config/monuments";
import { useAudio } from "@/systems/AudioManager";

// ═══════════════════════════════════════════════════════════
// MONUMENT ROUTE CONTEXT
// ═══════════════════════════════════════════════════════════

const MonumentRouteContext = createContext({
  monumentId: "desert",
  monument: null,
  pathname: "/",
});

export function useMonumentRoute() {
  return useContext(MonumentRouteContext);
}

// ═══════════════════════════════════════════════════════════
// WEBGL DETECTION
// ═══════════════════════════════════════════════════════════

function detectWebGL() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// MONUMENT ROUTER
// ═══════════════════════════════════════════════════════════

/**
 * @param {{ children: React.ReactNode, enable3D?: boolean }} props
 * @param {boolean} props.enable3D - When true, renders the full 3D MonumentScene.
 *   Default false — the existing 2D CSS monument backgrounds work without 3D.
 *   Set to true when ready to activate the full 3D experience.
 */
export default function MonumentRouter({ children, enable3D = false }) {
  const location = useLocation();
  const { playMonumentAmbient } = useAudio();
  const [webGLSupported] = useState(() => detectWebGL());

  // Map current route to monument
  const monumentId = useMemo(
    () => getMonumentForPath(location.pathname),
    [location.pathname],
  );
  const monument = useMemo(() => getMonument(monumentId), [monumentId]);

  // Set data-monument on body for CSS variable system
  useEffect(() => {
    document.body.setAttribute("data-monument", monumentId);
    return () => document.body.removeAttribute("data-monument");
  }, [monumentId]);

  // Trigger ambient audio on monument change
  useEffect(() => {
    playMonumentAmbient(monumentId);
  }, [monumentId, playMonumentAmbient]);

  const contextValue = useMemo(
    () => ({
      monumentId,
      monument,
      pathname: location.pathname,
      webGLSupported,
      enable3D: enable3D && webGLSupported,
    }),
    [monumentId, monument, location.pathname, webGLSupported, enable3D],
  );

  return (
    <MonumentRouteContext.Provider value={contextValue}>
      {children}
    </MonumentRouteContext.Provider>
  );
}
