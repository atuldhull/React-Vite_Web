import { useEffect, useRef } from "react";

const RING_COUNT = 8;
const PARTICLE_COUNT = 100;

export default function CosmicPortalBackground() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let w, h;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const portalX = () => w * 0.5;
    const portalY = () => h * 0.48;
    const maxRadius = () => Math.min(w, h) * 0.35;

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      angle: Math.random() * Math.PI * 2,
      distance: Math.random(),
      speed: Math.random() * 0.02 + 0.005,
      size: Math.random() * 2 + 0.5,
      orbitSpeed: Math.random() * 0.01 + 0.003,
      color: ["131,82,255", "35,193,255", "110,231,255", "255,255,255"][
        Math.floor(Math.random() * 4)
      ],
      trail: [],
    }));

    // Star field
    const stars = Array.from({ length: 150 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.5 + 0.2,
      twinkle: Math.random() * Math.PI * 2,
    }));

    let time = 0;

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      const cx = portalX();
      const cy = portalY();
      const mr = maxRadius();

      // Stars
      for (const star of stars) {
        star.twinkle += 0.02;
        const so = 0.3 + Math.sin(star.twinkle) * 0.25;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${so})`;
        ctx.fill();
      }

      // Outer glow
      const outerGlow = ctx.createRadialGradient(cx, cy, mr * 0.2, cx, cy, mr * 1.5);
      outerGlow.addColorStop(0, "rgba(131,82,255,0.08)");
      outerGlow.addColorStop(0.5, "rgba(35,193,255,0.04)");
      outerGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = outerGlow;
      ctx.fillRect(0, 0, w, h);

      // Portal rings
      for (let i = 0; i < RING_COUNT; i++) {
        const ringProgress = (i / RING_COUNT + time * 0.15) % 1;
        const radius = mr * ringProgress;
        const opacity = (1 - ringProgress) * 0.3;
        const wobble = Math.sin(time * 2 + i * 1.5) * 0.08;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(time * 0.3 + i * 0.4);
        ctx.scale(1 + wobble, 1 - wobble);

        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.4, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(131,82,255,${opacity})`;
        ctx.lineWidth = 2 * (1 - ringProgress) + 0.5;
        ctx.stroke();

        // Secondary ring
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.95, radius * 0.38, 0.2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(35,193,255,${opacity * 0.6})`;
        ctx.lineWidth = 1.5 * (1 - ringProgress);
        ctx.stroke();

        ctx.restore();
      }

      // Central vortex
      const vortexGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, mr * 0.3);
      vortexGrad.addColorStop(0, "rgba(110,231,255,0.15)");
      vortexGrad.addColorStop(0.3, "rgba(131,82,255,0.1)");
      vortexGrad.addColorStop(0.6, "rgba(35,193,255,0.05)");
      vortexGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = vortexGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, mr * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Pulsing core
      const pulseSize = mr * 0.08 * (1 + Math.sin(time * 3) * 0.3);
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseSize);
      coreGrad.addColorStop(0, "rgba(255,255,255,0.4)");
      coreGrad.addColorStop(0.5, "rgba(110,231,255,0.2)");
      coreGrad.addColorStop(1, "rgba(131,82,255,0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseSize, 0, Math.PI * 2);
      ctx.fill();

      // Spiral arms
      ctx.save();
      ctx.globalAlpha = 0.06;
      for (let arm = 0; arm < 4; arm++) {
        ctx.beginPath();
        for (let t = 0; t < 200; t++) {
          const spiralAngle = t * 0.05 + arm * (Math.PI / 2) + time * 0.5;
          const spiralR = t * mr * 0.005;
          const sx = cx + Math.cos(spiralAngle) * spiralR;
          const sy = cy + Math.sin(spiralAngle) * spiralR * 0.4;
          t === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = arm % 2 === 0 ? "#8352ff" : "#23c1ff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Orbiting particles
      for (const p of particles) {
        p.angle += p.orbitSpeed;
        p.distance += p.speed * 0.01;
        if (p.distance > 1.2) {
          p.distance = 0.1;
          p.trail = [];
        }

        const dist = p.distance * mr;
        const px = cx + Math.cos(p.angle) * dist;
        const py = cy + Math.sin(p.angle) * dist * 0.4;
        const pOpacity = (1 - p.distance) * 0.7;

        p.trail.unshift({ x: px, y: py });
        if (p.trail.length > 6) p.trail.pop();

        // Trail
        for (let i = 1; i < p.trail.length; i++) {
          const ta = pOpacity * (1 - i / p.trail.length) * 0.4;
          ctx.beginPath();
          ctx.arc(p.trail[i].x, p.trail[i].y, p.size * (1 - i / p.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color},${ta})`;
          ctx.fill();
        }

        // Particle
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${pOpacity})`;
        ctx.fill();
      }

      // Energy beams radiating outward
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const beamAngle = time * 0.3 + i * (Math.PI / 3);
        const beamLen = mr * (0.8 + Math.sin(time * 2 + i) * 0.2);
        const beamOpacity = 0.03 + Math.sin(time * 3 + i * 2) * 0.02;

        const bx1 = cx + Math.cos(beamAngle) * mr * 0.1;
        const by1 = cy + Math.sin(beamAngle) * mr * 0.04;
        const bx2 = cx + Math.cos(beamAngle) * beamLen;
        const by2 = cy + Math.sin(beamAngle) * beamLen * 0.4;

        const beamGrad = ctx.createLinearGradient(bx1, by1, bx2, by2);
        beamGrad.addColorStop(0, `rgba(131,82,255,${beamOpacity})`);
        beamGrad.addColorStop(1, "rgba(131,82,255,0)");

        ctx.beginPath();
        ctx.moveTo(bx1, by1);
        ctx.lineTo(bx2 - 3, by2 - 3);
        ctx.lineTo(bx2 + 3, by2 + 3);
        ctx.closePath();
        ctx.fillStyle = beamGrad;
        ctx.fill();
      }
      ctx.restore();

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      style={{ background: "transparent" }}
    />
  );
}
