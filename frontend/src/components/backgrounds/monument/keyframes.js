/**
 * Monument Background — Shared CSS keyframes
 * Injected once into the document head.
 */

const styleId = "monument-bg-keyframes";

export function ensureKeyframes() {
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
