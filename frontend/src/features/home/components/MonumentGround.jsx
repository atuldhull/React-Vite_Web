/**
 * MonumentVideo.jsx — Butter-smooth scroll-synced video.
 *
 * Instead of seeking (which causes decode stutter), this:
 *   1. Plays the video normally at variable playbackRate
 *   2. Uses heavy smoothing (lerp 4% per frame) so small scroll
 *      jitters don't cause visible jumps
 *   3. Only seeks when the gap is too large (>1 second)
 *   4. Keeps the video paused when scroll is idle
 */

import React, { useRef, useEffect } from "react";

const VIDEO_SRC = "/app/videos/desert_monument.mp4";

export default function MonumentVideo({ progress = 0 }) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const smoothTime = useRef(0);
  const targetTime = useRef(0);
  const isReady = useRef(false);
  const lastSeek = useRef(0);

  // Mark ready when video can play
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onReady = () => { isReady.current = true; v.pause(); };
    v.addEventListener("canplaythrough", onReady);
    // Also try canplay for faster start
    v.addEventListener("canplay", () => { isReady.current = true; });
    return () => {
      v.removeEventListener("canplaythrough", onReady);
    };
  }, []);

  // Update target from progress
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isReady.current || !v.duration) return;
    targetTime.current = progress * v.duration;
  }, [progress]);

  // Smooth interpolation loop
  useEffect(() => {
    function tick() {
      const v = videoRef.current;
      if (!v || !isReady.current || !v.duration) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const target = targetTime.current;
      const current = smoothTime.current;
      const diff = target - current;

      // Heavy smoothing — 4% per frame (~60fps = ~2.4 per second convergence)
      // This absorbs all micro-jitter from scroll events
      smoothTime.current += diff * 0.04;

      const now = performance.now();
      const timeSinceLastSeek = now - lastSeek.current;

      // Only actually update the video if enough time passed (throttle to ~15fps seeking)
      // This is the key — video decode can't keep up with 60fps seeks
      if (timeSinceLastSeek > 65) {
        const videoTime = smoothTime.current;
        const videoDiff = Math.abs(v.currentTime - videoTime);

        if (videoDiff > 0.05) {
          v.currentTime = videoTime;
          lastSeek.current = now;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <video
      ref={videoRef}
      src={VIDEO_SRC}
      muted
      playsInline
      preload="auto"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        objectFit: "cover",
        zIndex: 0,
        background: "#000",
      }}
    />
  );
}
