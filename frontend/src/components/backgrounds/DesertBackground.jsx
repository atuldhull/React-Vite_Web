import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 120;
const TUMBLEWEED_COUNT = 3;

function createDustParticle(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    size: Math.random() * 2.5 + 0.5,
    speedX: Math.random() * 1.5 + 0.3,
    speedY: Math.random() * 0.4 - 0.2,
    opacity: Math.random() * 0.5 + 0.1,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: Math.random() * 0.03 + 0.01,
  };
}

function createTumbleweed(w, h) {
  return {
    x: -50,
    y: h * (0.55 + Math.random() * 0.3),
    size: Math.random() * 25 + 15,
    speed: Math.random() * 1.5 + 0.8,
    rotation: 0,
    rotSpeed: Math.random() * 0.04 + 0.02,
    bounce: 0,
    bounceSpeed: Math.random() * 0.05 + 0.02,
    bouncePhase: Math.random() * Math.PI * 2,
  };
}

function drawCactus(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  // Main body
  ctx.beginPath();
  ctx.roundRect(-size * 0.12, -size, size * 0.24, size, size * 0.1);
  ctx.fillStyle = "rgba(34,85,34,0.25)";
  ctx.fill();
  ctx.strokeStyle = "rgba(34,120,34,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // Left arm
  ctx.beginPath();
  ctx.roundRect(-size * 0.35, -size * 0.7, size * 0.18, size * 0.4, size * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-size * 0.35, -size * 0.75, size * 0.18, size * 0.2, size * 0.08);
  ctx.fill();
  ctx.stroke();
  // Right arm
  ctx.beginPath();
  ctx.roundRect(size * 0.17, -size * 0.55, size * 0.18, size * 0.35, size * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(size * 0.17, -size * 0.6, size * 0.18, size * 0.18, size * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTumbleweed(ctx, tw) {
  ctx.save();
  ctx.translate(tw.x, tw.y + Math.sin(tw.bouncePhase) * 8);
  ctx.rotate(tw.rotation);
  ctx.globalAlpha = 0.35;

  const s = tw.size;
  // Tangled circle
  ctx.strokeStyle = "#8B7355";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const r1 = s * (0.6 + Math.sin(angle * 3) * 0.25);
    const r2 = s * (0.5 + Math.cos(angle * 5) * 0.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, r1, r2, angle, 0, Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

export default function DesertBackground() {
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

    let particles = Array.from({ length: PARTICLE_COUNT }, () => createDustParticle(w, h));
    let tumbleweeds = Array.from({ length: TUMBLEWEED_COUNT }, () => createTumbleweed(w, h));
    const cacti = Array.from({ length: 5 }, () => ({
      x: Math.random() * w * 0.8 + w * 0.1,
      size: Math.random() * 30 + 20,
    }));
    let time = 0;

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Sky gradient (warm desert tones blended with the dark theme)
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "rgba(15,8,30,0.4)");
      skyGrad.addColorStop(0.3, "rgba(45,20,60,0.3)");
      skyGrad.addColorStop(0.5, "rgba(120,60,30,0.15)");
      skyGrad.addColorStop(0.7, "rgba(180,100,40,0.1)");
      skyGrad.addColorStop(1, "rgba(60,30,15,0.2)");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Sun/moon
      const sunX = w * 0.78;
      const sunY = h * 0.18;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 120);
      sunGrad.addColorStop(0, "rgba(255,200,100,0.25)");
      sunGrad.addColorStop(0.3, "rgba(255,160,60,0.12)");
      sunGrad.addColorStop(1, "rgba(255,100,30,0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, w, h);

      // Heat shimmer
      ctx.save();
      ctx.globalAlpha = 0.03;
      for (let i = 0; i < 5; i++) {
        const shimmerY = h * 0.55 + i * 15;
        ctx.beginPath();
        ctx.moveTo(0, shimmerY);
        for (let x = 0; x < w; x += 20) {
          ctx.lineTo(x, shimmerY + Math.sin(time * 2 + x * 0.01 + i) * 3);
        }
        ctx.strokeStyle = "rgba(255,200,120,0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Sand dunes (layered)
      const duneColors = [
        "rgba(80,45,20,0.35)",
        "rgba(100,55,25,0.3)",
        "rgba(120,65,30,0.25)",
      ];
      for (let d = 0; d < 3; d++) {
        ctx.beginPath();
        const baseY = h * (0.58 + d * 0.1);
        ctx.moveTo(-10, h + 10);
        for (let x = -10; x <= w + 10; x += 5) {
          const dune =
            Math.sin(x * 0.003 + d * 1.5 + time * 0.05) * (40 - d * 8) +
            Math.sin(x * 0.008 + d * 3) * (20 - d * 5) +
            Math.sin(x * 0.001 + d * 0.5) * 60;
          ctx.lineTo(x, baseY + dune);
        }
        ctx.lineTo(w + 10, h + 10);
        ctx.closePath();
        ctx.fillStyle = duneColors[d];
        ctx.fill();
      }

      // Cacti silhouettes
      for (const cactus of cacti) {
        drawCactus(ctx, cactus.x, h * 0.6, cactus.size);
      }

      // Dust particles
      for (const p of particles) {
        p.wobble += p.wobbleSpeed;
        p.x += p.speedX;
        p.y += p.speedY + Math.sin(p.wobble) * 0.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,180,140,${p.opacity})`;
        ctx.fill();

        if (p.x > w + 10) {
          p.x = -10;
          p.y = Math.random() * h;
        }
        if (p.y < -10 || p.y > h + 10) {
          p.y = Math.random() * h;
        }
      }

      // Tumbleweeds
      for (let i = 0; i < tumbleweeds.length; i++) {
        const tw = tumbleweeds[i];
        tw.x += tw.speed;
        tw.rotation += tw.rotSpeed;
        tw.bouncePhase += tw.bounceSpeed;
        drawTumbleweed(ctx, tw);

        if (tw.x > w + 60) {
          tumbleweeds[i] = createTumbleweed(w, h);
        }
      }

      // Sand storm wisps
      ctx.save();
      ctx.globalAlpha = 0.04;
      for (let i = 0; i < 3; i++) {
        const stormY = h * 0.4 + i * h * 0.15;
        ctx.beginPath();
        ctx.moveTo(-50, stormY);
        for (let x = 0; x < w + 50; x += 30) {
          ctx.quadraticCurveTo(
            x + 15, stormY + Math.sin(time + x * 0.005 + i * 2) * 30,
            x + 30, stormY + Math.sin(time * 1.5 + x * 0.003 + i) * 20
          );
        }
        ctx.strokeStyle = "rgba(210,170,100,0.6)";
        ctx.lineWidth = 40;
        ctx.stroke();
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
