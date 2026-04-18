/**
 * MonumentVideo.jsx — Scroll-synced cinematic backdrop.
 *
 * Preloads a series of still frames from Cloudinary's video via the
 * `so_<time>` trick, then draws the correct frame to a full-screen
 * canvas based on scroll progress. Produces silkier scrubbing than
 * seeking an HTMLVideoElement (which stutters on most browsers) and
 * gets crisper output because each frame is served as a sharpened,
 * f_auto (WebP/AVIF) JPEG tuned to the viewport width.
 */

import { useEffect, useRef, useState } from "react";

const CLOUD_BASE    = "https://res.cloudinary.com/dvwrdexxh/video/upload";
const PUBLIC_PATH   = "/v1776451998/Cinematic_Zoom_Earth_to_Snowy_Kingdom_koczaz.jpg";
const VIDEO_URL     = "https://res.cloudinary.com/dvwrdexxh/video/upload/v1776451998/Cinematic_Zoom_Earth_to_Snowy_Kingdom_koczaz.mp4";
const FRAME_FPS     = 30;
const MAX_FRAMES    = 240;
const FRAME_QUALITY = 85;
const SHARPEN       = 100;

// Start showing the video once we've got this fraction of frames
// cached — enough that most scroll velocities will never outrun the
// buffer. The rest keep loading in the background.
const REVEAL_THRESHOLD = 0.35;
// Safety net: if the CDN is genuinely slow, reveal anyway after this
// long so the user never stares at a black page.
const MAX_BLACK_MS     = 7000;

function probeDuration() {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted   = true;
    v.src     = VIDEO_URL;
    const done = (t) => resolve(t > 0 ? t : 8);
    v.addEventListener("loadedmetadata", () => done(v.duration), { once: true });
    v.addEventListener("error",          () => done(8),          { once: true });
    setTimeout(() => done(v.duration || 8), 5000);
  });
}

function frameUrl(t, w) {
  const transforms = [
    `so_${t.toFixed(3)}`,
    `w_${w}`,
    `q_${FRAME_QUALITY}`,
    `e_sharpen:${SHARPEN}`,
    `f_auto`,
  ].join(",");
  return `${CLOUD_BASE}/${transforms}${PUBLIC_PATH}`;
}

export default function MonumentVideo({ progress = 0 }) {
  const canvasRef   = useRef(null);
  const ctxRef      = useRef(null);
  const imagesRef   = useRef([]);
  const lastIdx     = useRef(-1);
  const rafRef      = useRef(null);
  const progressRef = useRef(progress);
  const [ready, setReady] = useState(false);

  useEffect(() => { progressRef.current = progress; }, [progress]);

  // ── Canvas sizing (HiDPI + cover-fit) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext("2d");
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = Math.floor(window.innerWidth  * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width  = window.innerWidth  + "px";
      canvas.style.height = window.innerHeight + "px";
      const ctx = ctxRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      lastIdx.current = -1;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Preload frames ──
  useEffect(() => {
    let cancelled  = false;
    let revealed   = false;
    let loaded     = 0;
    let failed     = 0;

    const revealTimer = setTimeout(() => {
      if (!cancelled && !revealed && loaded > 0) {
        revealed = true;
        setReady(true);
      }
    }, MAX_BLACK_MS);

    (async () => {
      const duration = await probeDuration();
      if (cancelled) return;

      const dpr       = Math.min(window.devicePixelRatio || 1, 2);
      const physicalW = Math.ceil(window.innerWidth * dpr);
      const frameW    = Math.min(2560, Math.max(1440, physicalW));
      const count     = Math.min(MAX_FRAMES, Math.max(40, Math.ceil(duration * FRAME_FPS)));
      const step      = duration / (count - 1);
      const revealAt  = Math.max(1, Math.floor(count * REVEAL_THRESHOLD));

      imagesRef.current = new Array(count);

      const maybeReveal = () => {
        if (revealed || cancelled) return;
        if (loaded >= revealAt) {
          revealed = true;
          setReady(true);
        }
      };

      for (let i = 0; i < count; i++) {
        const t   = Math.min(duration - 0.01, i * step);
        const img = new window.Image();
        // No crossOrigin — we only drawImage (never read pixels back),
        // and omitting it avoids spurious CORS-related onerror firing
        // when the CDN response lacks the ACAO header.
        img.onload = () => {
          if (cancelled) return;
          loaded++;
          maybeReveal();
        };
        img.onerror = () => {
          if (cancelled) return;
          failed++;
          // If an unreasonable number fail, reveal anyway so we show
          // whatever did load rather than blocking forever.
          if (loaded > 0 && (loaded + failed) === count) maybeReveal();
        };
        imagesRef.current[i] = img;
        img.src = frameUrl(t, frameW);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(revealTimer);
    };
  }, []);

  // ── rAF draw loop driven by scroll progress ──
  useEffect(() => {
    function tick() {
      const imgs = imagesRef.current;
      if (imgs.length) {
        const last   = imgs.length - 1;
        const target = Math.max(0, Math.min(last, Math.round(progressRef.current * last)));
        drawIndex(target);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Finds the nearest loaded frame to `idx` (searching outward in both
  // directions), then draws it cover-fit. A fast-scrolling user on a
  // slow network sees a near-match, never a black gap.
  function drawIndex(idx) {
    const imgs = imagesRef.current;
    const ctx  = ctxRef.current;
    if (!ctx || !imgs.length) return;

    const last = imgs.length - 1;
    let use = -1;
    for (let d = 0; d <= last; d++) {
      const a = idx - d, b = idx + d;
      if (a >= 0 && imgs[a] && imgs[a].naturalWidth) { use = a; break; }
      if (b <= last && imgs[b] && imgs[b].naturalWidth) { use = b; break; }
    }
    if (use < 0) return;
    if (use === lastIdx.current) return;

    const img = imgs[use];
    const W = window.innerWidth, H = window.innerHeight;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    lastIdx.current = use;
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
          background: "#000",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "#000",
          opacity: ready ? 0 : 1,
          pointerEvents: ready ? "none" : "auto",
          transition: "opacity 900ms ease",
        }}
      />
    </>
  );
}
