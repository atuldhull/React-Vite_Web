import { useMemo } from "react";

/* ══════════════════════════════════════
   Shared keyframes — injected once
══════════════════════════════════════ */
const styleId = "monument-bg-keyframes";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    @keyframes desertFloat {
      from { transform: translateY(0) rotate(0deg); }
      to   { transform: translateY(-110vh) rotate(20deg); }
    }
    @keyframes pyramidPulse {
      0%   { opacity: 0; }
      100% { opacity: 0.6; }
    }
    @keyframes auroraShift {
      from { transform: translateX(-20%); }
      to   { transform: translateX(20%); }
    }
    @keyframes crystalSpin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes vineGrow {
      from { stroke-dashoffset: 100; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes fireflyBlink {
      0%   { opacity: 0; }
      50%  { opacity: 0.7; }
      100% { opacity: 0; }
    }
    @keyframes scanMove {
      from { transform: translateX(0); }
      to   { transform: translateX(100vw); }
    }
    @keyframes causticDrift {
      from { transform: translate(-30px, -20px); }
      to   { transform: translate(30px, 20px); }
    }
    @keyframes bioGlow {
      0%   { opacity: 0; }
      50%  { opacity: 0.8; }
      100% { opacity: 0; }
    }
    @keyframes starTwinkle {
      0%   { opacity: 0.2; }
      50%  { opacity: 0.8; }
      100% { opacity: 0.2; }
    }
    @keyframes islandDrift {
      0%   { transform: translateY(0); }
      50%  { transform: translateY(-12px); }
      100% { transform: translateY(0); }
    }
    @keyframes emberRise {
      from { transform: translateY(0); opacity: 0.8; }
      to   { transform: translateY(-60vh); opacity: 0; }
    }
    @keyframes lavaFlow {
      from { stroke-dashoffset: 100; }
      to   { stroke-dashoffset: 0; }
    }
  `;
  document.head.appendChild(style);
}

/* ══════════════════════════════════════
   DESERT — Sand dunes, Fibonacci spirals
══════════════════════════════════════ */
const desertSymbols = [
  { char: "∑", size: "2.5rem", left: "8%",  dur: "12s", delay: "0s" },
  { char: "∫", size: "2rem",   left: "20%", dur: "14s", delay: "2s" },
  { char: "π", size: "3rem",   left: "35%", dur: "10s", delay: "5s" },
  { char: "φ", size: "1.8rem", left: "52%", dur: "16s", delay: "1s" },
  { char: "∞", size: "2.2rem", left: "68%", dur: "11s", delay: "7s" },
  { char: "Δ", size: "1.5rem", left: "85%", dur: "13s", delay: "4s" },
];

function DesertBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, #3d1f00 0%, #1a0800 60%, #0a0400 100%)" }}>
      {desertSymbols.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: s.left,
            bottom: "-10%",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: s.size,
            color: "#D4A017",
            opacity: 0.25,
            animation: `desertFloat ${s.dur} ${s.delay} linear infinite`,
            pointerEvents: "none",
          }}
        >
          {s.char}
        </span>
      ))}
      {/* Sand haze */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "40%",
          background: "linear-gradient(to top, rgba(212,160,23,0.08) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════
   PYRAMID — Fractal glass pyramid, dusk
══════════════════════════════════════ */
const pyramidPulseDots = [
  { cx: 180, cy: 180, dur: "2.5s" },
  { cx: 220, cy: 200, dur: "3s" },
  { cx: 200, cy: 120, dur: "3.5s" },
  { cx: 150, cy: 240, dur: "2s" },
  { cx: 260, cy: 230, dur: "4s" },
];

function PyramidBg() {
  const stars = useMemo(() => {
    const s = [];
    for (let i = 0; i < 30; i++) {
      s.push({
        cx: (i * 137.5) % 400,
        cy: ((i * 89.3) % 180),
        r: 0.5 + (i % 3) * 0.25,
      });
    }
    return s;
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 80%, #12004a 0%, #080020 50%, #030010 100%)" }}>
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMax meet"
        style={{ position: "absolute", width: "100%", height: "100%", bottom: 0 }}
      >
        {/* Star field */}
        {stars.map((s, i) => (
          <circle key={`s${i}`} cx={s.cx} cy={s.cy} r={s.r} fill="white" opacity="0.4" />
        ))}

        {/* Wireframe pyramid */}
        <line x1="200" y1="20" x2="40"  y2="280" stroke="#7B4FE0" strokeWidth="0.8" opacity="0.3" />
        <line x1="200" y1="20" x2="160" y2="220" stroke="#7B4FE0" strokeWidth="0.8" opacity="0.3" />
        <line x1="200" y1="20" x2="240" y2="220" stroke="#7B4FE0" strokeWidth="0.8" opacity="0.3" />
        <line x1="200" y1="20" x2="360" y2="280" stroke="#7B4FE0" strokeWidth="0.8" opacity="0.3" />
        <line x1="40"  y1="280" x2="360" y2="280" stroke="#7B4FE0" strokeWidth="0.8" opacity="0.3" />
        <line x1="160" y1="220" x2="240" y2="220" stroke="#7B4FE0" strokeWidth="0.8" opacity="0.3" />

        {/* Pulse dots */}
        {pyramidPulseDots.map((d, i) => (
          <circle
            key={`p${i}`}
            cx={d.cx}
            cy={d.cy}
            r="2"
            fill="#7B4FE0"
            style={{ animation: `pyramidPulse ${d.dur} ease-in-out infinite alternate` }}
          />
        ))}
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════
   GLACIER — Ice geometry, northern lights
══════════════════════════════════════ */
const auroraBands = [
  { color: "rgba(0,255,180,1)", height: 80,  top: "10%", dur: "8s" },
  { color: "rgba(0,207,255,1)", height: 110, top: "25%", dur: "10s" },
  { color: "rgba(100,255,200,1)", height: 95, top: "40%", dur: "12s" },
];

const hexPoints = "10,0 20,5 20,15 10,20 0,15 0,5";
const crystals = [
  { x: "12%", y: "15%", size: 30, dur: "22s" },
  { x: "75%", y: "20%", size: 24, dur: "28s" },
  { x: "40%", y: "60%", size: 36, dur: "20s" },
  { x: "88%", y: "50%", size: 20, dur: "26s" },
  { x: "25%", y: "80%", size: 32, dur: "30s" },
  { x: "60%", y: "35%", size: 22, dur: "24s" },
  { x: "5%",  y: "55%", size: 28, dur: "25s" },
  { x: "50%", y: "85%", size: 40, dur: "21s" },
];

function GlacierBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #001428 0%, #002244 50%, #001428 100%)" }}>
      {/* Aurora bands */}
      {auroraBands.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: "200%",
            height: b.height,
            borderRadius: "50%",
            opacity: 0.12 + i * 0.03,
            background: b.color,
            top: b.top,
            left: "-50%",
            filter: "blur(30px)",
            animation: `auroraShift ${b.dur} ease-in-out infinite alternate`,
          }}
        />
      ))}

      {/* Ice crystals */}
      {crystals.map((c, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            width: c.size,
            height: c.size,
            animation: `crystalSpin ${c.dur} linear infinite`,
          }}
        >
          <polygon
            points={hexPoints}
            stroke="var(--monument-glacier)"
            strokeWidth="0.5"
            fill="none"
            opacity="0.15"
          />
        </svg>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════
   JUNGLE — Overgrown temple, Möbius vines
══════════════════════════════════════ */
const vinePath = "M 30 0 C 10 100, 50 200, 20 300 C 0 400, 40 500, 15 700 C 5 900, 35 1000, 20 1100";

const fireflies = [
  { top: "25%", left: "30%", dur: "3s",   delay: "0s" },
  { top: "40%", left: "55%", dur: "4s",   delay: "1.5s" },
  { top: "60%", left: "22%", dur: "2.5s", delay: "3s" },
  { top: "35%", left: "70%", dur: "3.5s", delay: "0.5s" },
  { top: "55%", left: "45%", dur: "5s",   delay: "2s" },
  { top: "70%", left: "60%", dur: "2s",   delay: "6s" },
  { top: "28%", left: "78%", dur: "4.5s", delay: "4s" },
  { top: "45%", left: "35%", dur: "3s",   delay: "7s" },
  { top: "65%", left: "50%", dur: "3.8s", delay: "1s" },
  { top: "50%", left: "25%", dur: "2.8s", delay: "5s" },
  { top: "30%", left: "65%", dur: "4.2s", delay: "3.5s" },
  { top: "75%", left: "40%", dur: "3.2s", delay: "8s" },
  { top: "38%", left: "80%", dur: "2.2s", delay: "2.5s" },
  { top: "58%", left: "72%", dur: "4.8s", delay: "6.5s" },
  { top: "48%", left: "28%", dur: "3.6s", delay: "4.5s" },
];

function JungleBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, #002a0a 0%, #001208 50%, #000a04 100%)" }}>
      {/* Left vine */}
      <svg
        style={{ position: "absolute", left: 0, top: 0, width: 60, height: "100%" }}
        viewBox="0 0 60 1100"
        preserveAspectRatio="none"
      >
        <path
          d={vinePath}
          stroke="#2ECC71"
          strokeWidth="1.5"
          fill="none"
          opacity="0.2"
          strokeDasharray="8 8"
          style={{ animation: "vineGrow 3s linear infinite" }}
        />
      </svg>

      {/* Right vine (mirrored) */}
      <svg
        style={{ position: "absolute", right: 0, top: 0, width: 60, height: "100%", transform: "scaleX(-1)" }}
        viewBox="0 0 60 1100"
        preserveAspectRatio="none"
      >
        <path
          d={vinePath}
          stroke="#2ECC71"
          strokeWidth="1.5"
          fill="none"
          opacity="0.2"
          strokeDasharray="8 8"
          style={{ animation: "vineGrow 3s linear infinite" }}
        />
      </svg>

      {/* Firefly dots */}
      {fireflies.map((f, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: f.top,
            left: f.left,
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "#90EE90",
            animation: `fireflyBlink ${f.dur} ${f.delay} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════
   CITY — Cyberpunk function-curve skyline
══════════════════════════════════════ */
const cityBuildings = [
  { x: 0,   y: 120, w: 60,  h: 180 },
  { x: 70,  y: 80,  w: 40,  h: 220 },
  { x: 120, y: 140, w: 80,  h: 160 },
  { x: 210, y: 60,  w: 50,  h: 240 },
  { x: 270, y: 110, w: 70,  h: 190 },
  { x: 350, y: 70,  w: 45,  h: 230 },
  { x: 405, y: 150, w: 65,  h: 150 },
  { x: 480, y: 90,  w: 55,  h: 210 },
  { x: 545, y: 130, w: 40,  h: 170 },
  { x: 595, y: 60,  w: 75,  h: 240 },
  { x: 680, y: 100, w: 50,  h: 200 },
  { x: 740, y: 140, w: 60,  h: 160 },
];

const cityWindows = [
  { x: 15,  y: 150, w: 4, h: 6 }, { x: 35,  y: 170, w: 4, h: 6 }, { x: 15,  y: 200, w: 4, h: 6 },
  { x: 80,  y: 110, w: 4, h: 6 }, { x: 90,  y: 150, w: 4, h: 6 }, { x: 80,  y: 190, w: 4, h: 6 },
  { x: 140, y: 170, w: 4, h: 6 }, { x: 160, y: 200, w: 4, h: 6 }, { x: 175, y: 170, w: 4, h: 6 },
  { x: 225, y: 90,  w: 4, h: 6 }, { x: 225, y: 130, w: 4, h: 6 }, { x: 240, y: 170, w: 4, h: 6 },
  { x: 290, y: 140, w: 4, h: 6 }, { x: 310, y: 180, w: 4, h: 6 }, { x: 290, y: 220, w: 4, h: 6 },
  { x: 365, y: 100, w: 4, h: 6 }, { x: 375, y: 150, w: 4, h: 6 }, { x: 365, y: 200, w: 4, h: 6 },
  { x: 425, y: 180, w: 4, h: 6 }, { x: 445, y: 210, w: 4, h: 6 },
  { x: 495, y: 120, w: 4, h: 6 }, { x: 510, y: 170, w: 4, h: 6 }, { x: 495, y: 220, w: 4, h: 6 },
  { x: 555, y: 160, w: 4, h: 6 }, { x: 565, y: 200, w: 4, h: 6 },
  { x: 615, y: 90,  w: 4, h: 6 }, { x: 635, y: 140, w: 4, h: 6 }, { x: 615, y: 190, w: 4, h: 6 }, { x: 645, y: 230, w: 4, h: 6 },
  { x: 695, y: 130, w: 4, h: 6 }, { x: 710, y: 180, w: 4, h: 6 },
  { x: 755, y: 170, w: 4, h: 6 }, { x: 775, y: 210, w: 4, h: 6 },
];

function CityBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#04000f" }}>
      {/* Function curves overlay */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 300" preserveAspectRatio="none">
        <path d="M 0 150 Q 100 80, 200 150 Q 300 220, 400 150 Q 500 80, 600 150 Q 700 220, 800 150" stroke="#FF2D78" opacity="0.1" strokeWidth="1" fill="none" />
        <path d="M 50 300 Q 400 0, 750 300" stroke="#FF2D78" opacity="0.08" strokeWidth="1" fill="none" />
        <path d="M 0 280 C 100 270, 300 200, 800 10" stroke="#FF2D78" opacity="0.06" strokeWidth="1" fill="none" />
      </svg>

      {/* Building skyline */}
      <svg style={{ position: "absolute", bottom: 0, width: "100%", height: "50%" }} viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice">
        {cityBuildings.map((b, i) => (
          <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#120030" />
        ))}
        {cityWindows.map((w, i) => (
          <rect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} fill="#FF2D78" opacity="0.4" />
        ))}
      </svg>

      {/* Scan line */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: "100%",
          background: "linear-gradient(to bottom, transparent, rgba(255,45,120,0.4), transparent)",
          animation: "scanMove 6s linear infinite",
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════
   ABYSS — Underwater cathedral, bioluminescence
══════════════════════════════════════ */
const causticEllipses = [
  { w: 200, h: 80,  top: "12%", left: "15%", dur: "7s",  delay: "0s" },
  { w: 150, h: 60,  top: "28%", left: "55%", dur: "9s",  delay: "2s" },
  { w: 300, h: 100, top: "18%", left: "35%", dur: "6s",  delay: "4s" },
  { w: 180, h: 70,  top: "38%", left: "70%", dur: "10s", delay: "1s" },
];

const bioParticles = [
  { top: "8%",  left: "12%", dur: "5s",   delay: "0s" },
  { top: "15%", left: "45%", dur: "4s",   delay: "2s" },
  { top: "22%", left: "78%", dur: "6s",   delay: "5s" },
  { top: "30%", left: "30%", dur: "3.5s", delay: "1s" },
  { top: "38%", left: "62%", dur: "7s",   delay: "8s" },
  { top: "45%", left: "18%", dur: "4.5s", delay: "3s" },
  { top: "52%", left: "85%", dur: "5.5s", delay: "11s" },
  { top: "58%", left: "50%", dur: "3s",   delay: "6s" },
  { top: "65%", left: "25%", dur: "6.5s", delay: "14s" },
  { top: "72%", left: "70%", dur: "4s",   delay: "9s" },
  { top: "78%", left: "40%", dur: "5s",   delay: "4s" },
  { top: "85%", left: "90%", dur: "3.8s", delay: "12s" },
  { top: "20%", left: "55%", dur: "6s",   delay: "7s" },
  { top: "42%", left: "8%",  dur: "4.2s", delay: "10s" },
  { top: "60%", left: "35%", dur: "5.2s", delay: "15s" },
  { top: "33%", left: "92%", dur: "3.2s", delay: "2.5s" },
  { top: "50%", left: "65%", dur: "7s",   delay: "13s" },
  { top: "70%", left: "15%", dur: "4.8s", delay: "6.5s" },
  { top: "90%", left: "48%", dur: "5.8s", delay: "3.5s" },
  { top: "12%", left: "80%", dur: "3.5s", delay: "8.5s" },
];

function AbyssBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, #001f3a 0%, #000d1a 60%, #000508 100%)" }}>
      {/* Caustic light patterns */}
      {causticEllipses.map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: c.w,
            height: c.h,
            borderRadius: "50%",
            opacity: 0.06,
            background: "rgba(0,255,200,1)",
            filter: "blur(20px)",
            top: c.top,
            left: c.left,
            animation: `causticDrift ${c.dur} ${c.delay} ease-in-out infinite alternate`,
          }}
        />
      ))}

      {/* Bioluminescent particles */}
      {bioParticles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: i % 2 === 0 ? "#00FFC8" : "#00FFAA",
            top: p.top,
            left: p.left,
            animation: `bioGlow ${p.dur} ${p.delay} ease-in-out infinite`,
          }}
        />
      ))}

      {/* Depth haze */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "30%",
          background: "linear-gradient(to top, rgba(0,20,40,0.6), transparent)",
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════
   SKY — Floating islands, integral bridges
══════════════════════════════════════ */
const skyStars = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 17.3) % 98 + 1}%`,
  top: `${(i * 23.7) % 70}%`,
  size: 1 + (i % 2),
  dur: `${2 + (i % 4)}s`,
  delay: `${(i * 0.73) % 10}s`,
}));

function SkyBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0f0025 0%, #1a0840 40%, #0a0520 100%)" }}>
      {/* Star field */}
      {skyStars.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "white",
            animation: `starTwinkle ${s.dur} ${s.delay} ease-in-out infinite`,
          }}
        />
      ))}

      {/* Floating island 1 — left */}
      <svg
        viewBox="0 0 120 100"
        style={{ position: "absolute", left: "10%", top: "30%", width: 160, height: 130, animation: "islandDrift 8s ease-in-out infinite" }}
      >
        <polygon points="20,50 0,80 40,90 80,80 90,60 70,50 50,45" fill="#2a1060" opacity="0.5" />
        {/* Tree stubs */}
        <rect x="35" y="32" width="4" height="14" fill="#3a1880" opacity="0.5" />
        <polygon points="37,22 30,36 44,36" fill="#3a1880" opacity="0.4" />
        <rect x="60" y="36" width="3" height="12" fill="#3a1880" opacity="0.5" />
        <polygon points="61,28 55,40 68,40" fill="#3a1880" opacity="0.4" />
      </svg>

      {/* Floating island 2 — right */}
      <svg
        viewBox="0 0 100 80"
        style={{ position: "absolute", right: "12%", top: "20%", width: 120, height: 100, animation: "islandDrift 8s 1s ease-in-out infinite" }}
      >
        <polygon points="15,40 0,65 30,72 65,65 75,48 55,40 40,36" fill="#2a1060" opacity="0.5" />
        <rect x="30" y="26" width="3" height="12" fill="#3a1880" opacity="0.5" />
        <polygon points="31,18 25,30 38,30" fill="#3a1880" opacity="0.4" />
      </svg>

      {/* Iridescent bridge */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bridgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#B695F8" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#B695F8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#B695F8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M 120 140 Q 400 80, 660 100"
          stroke="url(#bridgeGrad)"
          strokeWidth="1"
          fill="none"
          opacity="0.15"
        />
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════
   MAGMA — Volcanic foundry, glowing runes
══════════════════════════════════════ */
const embers = [
  { left: "8%",  bottom: "2%",  dur: "5s",   delay: "0s" },
  { left: "18%", bottom: "5%",  dur: "7s",   delay: "1.5s" },
  { left: "28%", bottom: "0%",  dur: "4.5s", delay: "3s" },
  { left: "38%", bottom: "8%",  dur: "6s",   delay: "5s" },
  { left: "48%", bottom: "3%",  dur: "8s",   delay: "2s" },
  { left: "58%", bottom: "6%",  dur: "4s",   delay: "7s" },
  { left: "68%", bottom: "1%",  dur: "6.5s", delay: "4s" },
  { left: "78%", bottom: "9%",  dur: "5.5s", delay: "9s" },
  { left: "88%", bottom: "4%",  dur: "7.5s", delay: "6s" },
  { left: "15%", bottom: "7%",  dur: "4.8s", delay: "10s" },
  { left: "55%", bottom: "2%",  dur: "6.2s", delay: "8s" },
  { left: "92%", bottom: "5%",  dur: "5.2s", delay: "3.5s" },
];

function MagmaBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, #200800 0%, #100200 60%, #050000 100%)" }}>
      {/* Lava glow at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "25%",
          background: "linear-gradient(to top, rgba(255,80,0,0.15), transparent)",
        }}
      />

      {/* Lava flow paths */}
      <svg style={{ position: "absolute", bottom: 0, width: "100%", height: "40%" }} viewBox="0 0 900 250" preserveAspectRatio="none">
        <path
          d="M 0 200 C 100 150, 200 180, 300 140 C 400 100, 500 160, 600 120 C 700 80, 800 150, 900 100"
          stroke="#FF6B35"
          strokeWidth="2"
          fill="none"
          opacity="0.2"
          strokeDasharray="10 5"
          style={{ animation: "lavaFlow 4s linear infinite" }}
        />
        <path
          d="M 0 240 C 150 200, 250 220, 400 190 C 550 160, 650 200, 800 170"
          stroke="#FF6B35"
          strokeWidth="2"
          fill="none"
          opacity="0.2"
          strokeDasharray="10 5"
          style={{ animation: "lavaFlow 4s 1s linear infinite" }}
        />
      </svg>

      {/* Ember particles */}
      {embers.map((e, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: e.left,
            bottom: e.bottom,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: i % 2 === 0 ? "#FF6B35" : "#FF4500",
            animation: `emberRise ${e.dur} ${e.delay} ease-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN SWITCH
══════════════════════════════════════ */
const monumentMap = {
  desert: DesertBg,
  pyramid: PyramidBg,
  glacier: GlacierBg,
  jungle: JungleBg,
  city: CityBg,
  abyss: AbyssBg,
  sky: SkyBg,
  magma: MagmaBg,
};

export default function MonumentBackground({ monument, intensity = 0.15 }) {
  ensureKeyframes();

  const Scene = monumentMap[monument];
  if (!Scene) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, opacity: intensity, pointerEvents: "none", overflow: "hidden" }}>
        <Scene />
      </div>
    </div>
  );
}
