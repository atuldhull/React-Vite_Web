import { useRef } from "react";
import { Link } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useReducedMotion } from "framer-motion";

/**
 * CoreMindMap — the Core Team dashboard navigation, drawn as a mind map.
 *
 * A glowing central hub with the section nodes orbiting it on a ring,
 * joined by "strings" that flow (animated dashes) with a light pulse
 * travelling hub → node. Two faint orbit rings rotate behind it. Every
 * node is a Link, so clicking redirects. All motion is GSAP-driven and
 * fully disabled under prefers-reduced-motion (nodes stay clickable).
 */

const VB   = 560;   // SVG viewBox (square)
const HUB  = 280;   // hub centre
const RING = 200;   // node-ring radius

export default function CoreMindMap({ nodes, hubLabel = "CORE" }) {
  const scope = useRef(null);
  const reduced = useReducedMotion();

  // Lay the nodes evenly around the ring (first node at the top), and
  // pre-compute string endpoints trimmed to the hub / node edges.
  const placed = nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    const x = HUB + Math.cos(a) * RING;
    const y = HUB + Math.sin(a) * RING;
    const len = Math.hypot(x - HUB, y - HUB) || 1;
    const ux = (x - HUB) / len;
    const uy = (y - HUB) / len;
    return {
      ...n, i, x, y,
      x1: HUB + ux * 56, y1: HUB + uy * 56,   // string start — hub edge
      x2: x - ux * 50,   y2: y - uy * 50,     // string end — node edge
    };
  });

  useGSAP(() => {
    if (reduced) return;
    // Strings flow.
    gsap.to(".mm-flow", { strokeDashoffset: -32, duration: 1.1, ease: "none", repeat: -1 });
    // Orbit rings rotate, opposite directions.
    gsap.to(".mm-orbit-a", { rotation: 360,  svgOrigin: `${HUB} ${HUB}`, duration: 64, ease: "none", repeat: -1 });
    gsap.to(".mm-orbit-b", { rotation: -360, svgOrigin: `${HUB} ${HUB}`, duration: 88, ease: "none", repeat: -1 });
    // Hub aura breathes.
    gsap.to(".mm-aura", { scale: 1.16, opacity: 0.7, svgOrigin: `${HUB} ${HUB}`,
      duration: 2.4, ease: "sine.inOut", yoyo: true, repeat: -1 });
    // Nodes drift gently.
    gsap.to(".mm-node", { y: "-=9", duration: 2.8, ease: "sine.inOut", yoyo: true,
      repeat: -1, stagger: { each: 0.3, from: "random" } });
    // A light pulse travels each string, hub → node.
    placed.forEach((p) => {
      gsap.timeline({ repeat: -1, repeatDelay: 0.5, delay: p.i * 0.32 })
        .set(`#mm-pulse-${p.i}`, { attr: { cx: p.x1, cy: p.y1 }, opacity: 0 })
        .to(`#mm-pulse-${p.i}`, { opacity: 0.95, duration: 0.3 })
        .to(`#mm-pulse-${p.i}`, { attr: { cx: p.x2, cy: p.y2 }, duration: 2.0, ease: "power1.inOut" }, "<")
        .to(`#mm-pulse-${p.i}`, { opacity: 0, duration: 0.45 }, "-=0.45");
    });
  }, { scope, dependencies: [reduced, nodes] });

  return (
    <div ref={scope} className="relative mx-auto mt-2 aspect-square w-full max-w-[560px]">
      <svg viewBox={`0 0 ${VB} ${VB}`} className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <radialGradient id="mm-hub-grad" cx="50%" cy="42%" r="60%">
            <stop offset="0%"   stopColor="#c4b5fd" />
            <stop offset="55%"  stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#3b0f73" />
          </radialGradient>
        </defs>

        {/* rotating orbit rings */}
        <circle className="mm-orbit-a" cx={HUB} cy={HUB} r={RING} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="2 15" />
        <circle className="mm-orbit-b" cx={HUB} cy={HUB} r={RING - 46} fill="none"
          stroke="rgba(124,58,237,0.16)" strokeWidth="1" strokeDasharray="3 22" />

        {/* connector strings */}
        {placed.map((p) => (
          <g key={p.i}>
            <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
              stroke={p.color} strokeOpacity="0.16" strokeWidth="2.5" />
            <line className="mm-flow" x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
              stroke={p.color} strokeOpacity="0.72" strokeWidth="2"
              strokeDasharray="5 11" strokeLinecap="round" />
            <circle id={`mm-pulse-${p.i}`} cx={p.x1} cy={p.y1} r="5"
              fill={p.color} opacity="0" />
          </g>
        ))}

        {/* hub */}
        <circle className="mm-aura" cx={HUB} cy={HUB} r="76" fill="#7c3aed" opacity="0.22" />
        <circle cx={HUB} cy={HUB} r="52" fill="url(#mm-hub-grad)" />
        <circle cx={HUB} cy={HUB} r="52" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      </svg>

      {/* hub label (crisp HTML, centred on the hub) */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="font-display text-lg font-bold tracking-tight text-white">{hubLabel}</p>
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/75">portal</p>
      </div>

      {/* nodes — outer div is centred (static); inner Link is GSAP-floated */}
      {placed.map((p) => (
        <div
          key={p.i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(p.x / VB) * 100}%`, top: `${(p.y / VB) * 100}%` }}
        >
          <Link
            to={p.to}
            aria-label={p.label}
            className="mm-node group flex flex-col items-center gap-2"
          >
            <span
              className="flex h-[clamp(3.1rem,12vw,4.7rem)] w-[clamp(3.1rem,12vw,4.7rem)] items-center justify-center rounded-full border bg-surface/85 backdrop-blur-xl transition-transform duration-300 group-hover:scale-[1.14]"
              style={{ borderColor: `${p.color}66`, boxShadow: `0 0 24px ${p.color}33` }}
            >
              <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24"
                stroke={p.color} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
              </svg>
            </span>
            <span className="rounded-full bg-black/45 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white transition-colors group-hover:text-white">
              {p.label}
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}
