/**
 * MonumentVideo.jsx — Scroll-synced cinematic backdrop.
 *
 * Two-layer render with no loading screen:
 *
 *   1. An <img> at the first frame URL shows instantly (~200ms
 *      from cold) — anyone opening the page sees the Earth
 *      immediately, never a black screen.
 *   2. A <canvas> on top, transparent until the draw loop has
 *      something to paint. Every requestAnimationFrame it reads
 *      window.scrollY directly, picks the nearest loaded frame,
 *      and covers the <img>. Frames keep preloading + decoding
 *      in the background so by the time the user scrolls past
 *      the hero, the entire sequence is cached and scrub-ready.
 */

import { useEffect, useRef } from "react";

const CLOUD_BASE    = "https://res.cloudinary.com/dvwrdexxh/video/upload";
const PUBLIC_PATH   = "/v1776451998/Cinematic_Zoom_Earth_to_Snowy_Kingdom_koczaz.jpg";
const VIDEO_URL     = "https://res.cloudinary.com/dvwrdexxh/video/upload/v1776451998/Cinematic_Zoom_Earth_to_Snowy_Kingdom_koczaz.mp4";
const FRAME_FPS     = 30;
const MAX_FRAMES    = 180;
const FRAME_QUALITY = 82;
const SHARPEN       = 80;

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

// Scroll distance (px) that drives progress 0→1. Matches the
// 500vh scroll spacer in HomePage.jsx.
function scrollSpan() {
  return window.innerHeight * 5;
}

// First-frame URL used as the instant-paint fallback. Computed at
// module scope so the browser can start fetching it as soon as the
// component imports — no render needed.
function firstFrameFallbackUrl() {
  const dpr = (typeof window !== "undefined" && Math.min(window.devicePixelRatio || 1, 2)) || 1;
  const w   = Math.min(2560, Math.max(1600, Math.ceil((typeof window !== "undefined" ? window.innerWidth : 1920) * dpr)));
  return frameUrl(0, w);
}

export default function MonumentVideo() {
  const canvasRef   = useRef(null);
  const ctxRef      = useRef(null);
  const imagesRef   = useRef([]);
  const drawGeomRef = useRef({ W: 0, H: 0 });
  const lastIdx     = useRef(-1);
  const rafRef      = useRef(null);

  // ── Canvas sizing (HiDPI + cover-fit) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // alpha:true — un-drawn regions stay transparent so the <img>
    // underneath shows through until the canvas has real content.
    ctxRef.current = canvas.getContext("2d", { alpha: true });
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth;
      const H = window.innerHeight;
      canvas.width  = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width  = W + "px";
      canvas.style.height = H + "px";
      const ctx = ctxRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Cheap resampling — the source frame is already at viewport
      // width, so "low" is indistinguishable from "high" visually
      // and dramatically faster on the hot path.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";
      drawGeomRef.current = { W, H };
      lastIdx.current = -1;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Preload + pre-decode every frame in the background ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const duration = await probeDuration();
      if (cancelled) return;

      const dpr       = Math.min(window.devicePixelRatio || 1, 2);
      const physicalW = Math.ceil(window.innerWidth * dpr);
      const frameW    = Math.min(2560, Math.max(1600, physicalW));
      const count     = Math.min(MAX_FRAMES, Math.max(40, Math.ceil(duration * FRAME_FPS)));
      const step      = duration / (count - 1);

      imagesRef.current = new Array(count);

      for (let i = 0; i < count; i++) {
        const t   = Math.min(duration - 0.01, i * step);
        const img = new window.Image();
        img.onload = () => {
          if (cancelled) return;
          // Pre-decode so the first drawImage() doesn't pay the decode
          // cost on the main thread — biggest single source of
          // first-scrub stutter.
          if (img.decode) img.decode().catch(() => {});
        };
        imagesRef.current[i] = img;
        img.src = frameUrl(t, frameW);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── rAF draw loop — reads scrollY directly every frame ──
  useEffect(() => {
    function tick() {
      const imgs = imagesRef.current;
      if (imgs.length) {
        const span = scrollSpan();
        const p = span > 0 ? Math.max(0, Math.min(1, window.scrollY / span)) : 0;
        const last = imgs.length - 1;
        drawIndex(Math.round(p * last));
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  function drawIndex(idx) {
    const imgs = imagesRef.current;
    const ctx  = ctxRef.current;
    if (!ctx || !imgs.length) return;

    // Find nearest loaded + decoded frame (both directions). Until
    // any frame is ready the canvas stays transparent and the <img>
    // fallback shows through.
    const last = imgs.length - 1;
    let use = -1;
    for (let d = 0; d <= last; d++) {
      const a = idx - d, b = idx + d;
      if (a >= 0 && imgs[a] && imgs[a].naturalWidth)   { use = a; break; }
      if (b <= last && imgs[b] && imgs[b].naturalWidth) { use = b; break; }
    }
    if (use < 0 || use === lastIdx.current) return;

    const img = imgs[use];
    const { W, H } = drawGeomRef.current;
    const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    // Canvas alpha is true, but every frame fully covers the viewport
    // in cover-fit, so no clearRect is needed — drawImage replaces
    // all pixels.
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    lastIdx.current = use;
  }

  return (
    <>
      {/* Static first-frame — instant paint on cold load so the hero
          never appears as a black screen. Hidden beneath the canvas;
          the canvas covers it once any real frame is drawn. */}
      <img
        src={firstFrameFallbackUrl()}
        alt=""
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          zIndex: 0,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
