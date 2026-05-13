/**
 * VideoScrubHero — pre-rendered hero video, scrubbed by scroll.
 *
 * What this is:
 *   A full-screen fixed-position video element where the current
 *   playback time is driven entirely by the page's scroll position.
 *   The video is offline-rendered (Blender / Unreal / etc) so the
 *   visual fidelity isn't bound by browser real-time GPU limits —
 *   it can be cinema-quality.
 *
 * Why two videos:
 *   Day + night variants tied to the theme toggle. We hold both
 *   elements mounted (one visible, one invisible) and cross-fade
 *   their opacity on theme change for a smooth swap. Inactive
 *   video uses preload="metadata" so we only download enough to
 *   know its duration until it's actually shown.
 *
 * Scroll → currentTime mapping:
 *   The scrollSpan is the same as the existing Three.js LibraryScene
 *   (window.innerHeight * 5 = 500vh), so the spacer in HomePage works
 *   for both implementations interchangeably. Progress 0→1 maps
 *   linearly onto 0→videoDuration via rAF, smoothed against jitter.
 *
 * Codec note for the rendering pipeline (see public/videos/README.md):
 *   - H.264 baseline or main profile
 *   - Frequent keyframes (every ~30 frames / 1s) for seek smoothness
 *   - 1080p, 24-30fps, ~10-15 Mbps target bitrate
 *   - Muted audio track (we mute on playback anyway, but saves bytes)
 */

import { useEffect, useRef } from "react";
import { useUiStore } from "@/store/ui-store";

function scrollSpan() { return window.innerHeight * 5; }

export default function VideoScrubHero() {
  const theme = useUiStore((s) => s.theme);
  const nightRef = useRef(null);
  const dayRef   = useRef(null);
  const rafRef   = useRef(null);

  // Day variant lights up only on theme "light". "dark" and "eclipse"
  // both fall through to night — eclipse is a darker variant of dark,
  // visually closer to night than to morning.
  const showDay = theme === "light";

  // Per-frame scroll → currentTime mapping. Updates BOTH videos so
  // the inactive one stays in sync (cross-fade looks continuous when
  // the user toggles theme mid-scroll). Smoothing is implicit:
  // currentTime jumps are accepted by H.264 decoders that have the
  // nearest keyframe handy, hence the keyframe-every-30-frames
  // render spec.
  useEffect(() => {
    const tick = () => {
      const y    = window.scrollY;
      const span = scrollSpan();
      const p    = span > 0 ? Math.max(0, Math.min(1, y / span)) : 0;
      [nightRef.current, dayRef.current].forEach((v) => {
        if (v && v.duration && Number.isFinite(v.duration)) {
          const target = p * v.duration;
          // Only seek if we've moved meaningfully — avoids spamming
          // the decoder with sub-frame seeks on every rAF tick.
          if (Math.abs(v.currentTime - target) > 0.02) {
            v.currentTime = target;
          }
        }
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // When the user toggles theme, upgrade the now-active video's
  // preload from "metadata" to "auto" so it streams in fully ready
  // for scrubbing. The previously-active one stays in memory; if
  // they toggle back it'll resume instantly from cache.
  useEffect(() => {
    const active = showDay ? dayRef.current : nightRef.current;
    if (active && active.preload === "metadata") {
      active.preload = "auto";
      try { active.load(); } catch { /* harmless if not yet ready */ }
    }
  }, [showDay]);

  const videoStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transition: "opacity 700ms ease",
    willChange: "opacity",
    pointerEvents: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        background: "#05030a",   // matches the LibraryScene clear color
        overflow: "hidden",
      }}
      aria-hidden="true"
    >
      <video
        ref={nightRef}
        src="/app/videos/hero-night.mp4"
        muted
        playsInline
        preload={showDay ? "metadata" : "auto"}
        // Disable picture-in-picture and remote playback prompts so the
        // mobile browser doesn't surface "play in PiP" affordances over
        // a decorative background.
        disablePictureInPicture
        controlsList="nodownload noremoteplayback nofullscreen"
        style={{ ...videoStyle, opacity: showDay ? 0 : 1 }}
      />
      <video
        ref={dayRef}
        src="/app/videos/hero-day.mp4"
        muted
        playsInline
        preload={showDay ? "auto" : "metadata"}
        disablePictureInPicture
        controlsList="nodownload noremoteplayback nofullscreen"
        style={{ ...videoStyle, opacity: showDay ? 1 : 0 }}
      />
    </div>
  );
}
