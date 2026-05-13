/**
 * HeroExperience — dispatcher that picks the best hero implementation
 * for the current build.
 *
 * Two paths:
 *
 *   1. Pre-rendered video (VideoScrubHero) — when /app/videos/hero-
 *      night.mp4 is present in the build output. Cinema-quality
 *      Blender / Unreal renders, scroll-driven scrubbing, day/night
 *      cross-fade tied to the theme toggle. This is the target.
 *
 *   2. Real-time WebGL (LibraryScene) — the Three.js fallback that
 *      ships as long as no video file is present. Keeps working
 *      forever; we don't need the video to be done before launch.
 *
 * Detection strategy:
 *   HEAD-request /app/videos/hero-night.mp4. If it returns 200, we
 *   switch to video. Anything else (404 default, network error,
 *   CSP block) → fall through to LibraryScene. Detection happens
 *   asynchronously so the page doesn't block on the check; during
 *   detection we show a slim dark gradient placeholder.
 *
 * Adding the video later:
 *   Drop the rendered MP4s into `frontend/public/videos/` (see the
 *   README in that folder for filename + spec). Vite copies them
 *   to `public/app/videos/` at build time. Next deploy lights up
 *   the video path automatically. No code change needed.
 */

import { useEffect, useState, lazy, Suspense } from "react";

const VideoScrubHero = lazy(() => import("./VideoScrubHero"));
const LibraryScene   = lazy(() => import("./LibraryScene"));

// Dark gradient shown while we're still figuring out which mode to
// render. Matches the LibraryScene clear color so the transition
// into either branch is seamless. Visible for ~50-200ms typically.
function HeroDetecting() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 0,
        pointerEvents: "none",
        background:
          "radial-gradient(ellipse at center bottom, rgba(255,177,92,0.10), transparent 50%), " +
          "radial-gradient(ellipse at center, rgba(124,58,237,0.05), transparent 60%), " +
          "#05030a",
      }}
    />
  );
}

export default function HeroExperience() {
  const [mode, setMode] = useState("detecting");   // detecting | video | webgl

  useEffect(() => {
    // sessionStorage cache so subsequent navigations within the same
    // tab skip the HEAD probe. localStorage would be wrong — if the
    // user adds the video tomorrow, an old false-cached "webgl"
    // result would stick around. Per-session is the right TTL.
    const cached = (() => {
      try { return sessionStorage.getItem("hero-mode"); } catch { return null; }
    })();
    if (cached === "video" || cached === "webgl") {
      setMode(cached);
      return;
    }

    let cancelled = false;
    fetch("/app/videos/hero-night.mp4", { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        const next = res.ok ? "video" : "webgl";
        setMode(next);
        try { sessionStorage.setItem("hero-mode", next); } catch { /* incognito */ }
      })
      .catch(() => {
        if (cancelled) return;
        setMode("webgl");
        try { sessionStorage.setItem("hero-mode", "webgl"); } catch { /* incognito */ }
      });

    return () => { cancelled = true; };
  }, []);

  if (mode === "detecting") return <HeroDetecting />;

  if (mode === "video") {
    return (
      <Suspense fallback={<HeroDetecting />}>
        <VideoScrubHero />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<HeroDetecting />}>
      <LibraryScene />
    </Suspense>
  );
}
