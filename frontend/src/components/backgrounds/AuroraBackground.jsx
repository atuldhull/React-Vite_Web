import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 80;
const AURORA_BANDS = 5;

function createParticle(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    size: Math.random() * 2.5 + 0.5,
    speedY: -(Math.random() * 0.5 + 0.1),
    speedX: (Math.random() - 0.5) * 0.3,
    opacity: Math.random() * 0.5 + 0.2,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: Math.random() * 0.02 + 0.005,
    color: ["131,82,255", "35,193,255", "110,231,255", "45,212,191"][
      Math.floor(Math.random() * 4)
    ],
  };
}

export default function AuroraBackground() {
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

    let particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(w, h));
    let time = 0;

    const auroraBands = Array.from({ length: AURORA_BANDS }, (_, i) => ({
      baseY: h * (0.15 + i * 0.08),
      color1: [
        "rgba(45,212,191,",
        "rgba(110,231,255,",
        "rgba(131,82,255,",
        "rgba(35,193,255,",
        "rgba(45,212,191,",
      ][i],
      color2: [
        "rgba(131,82,255,",
        "rgba(45,212,191,",
        "rgba(35,193,255,",
        "rgba(110,231,255,",
        "rgba(131,82,255,",
      ][i],
      amplitude: 30 + i * 10,
      frequency: 0.002 + i * 0.0005,
      speed: 0.3 + i * 0.1,
      width: 60 + i * 15,
      opacity: 0.12 - i * 0.015,
    }));

    // Mountains silhouette points
    const mountainPoints = [];
    for (let x = 0; x <= 1; x += 0.005) {
      const y =
        Math.sin(x * 8) * 0.04 +
        Math.sin(x * 15 + 2) * 0.025 +
        Math.sin(x * 3) * 0.06 +
        0.72;
      mountainPoints.push({ x, y });
    }

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Night sky base
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, "rgba(3,7,18,0.5)");
      skyGrad.addColorStop(0.4, "rgba(9,15,40,0.3)");
      skyGrad.addColorStop(1, "rgba(5,10,25,0.4)");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Stars (static twinkling)
      for (let i = 0; i < 100; i++) {
        const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * w;
        const sy = (Math.cos(i * 311.7) * 0.5 + 0.5) * h * 0.65;
        const ss = (Math.sin(i * 43.7) * 0.5 + 0.5) * 1.5 + 0.3;
        const so = 0.3 + Math.sin(time * 2 + i * 7.3) * 0.2;
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${so})`;
        ctx.fill();
      }

      // Aurora bands
      for (const band of auroraBands) {
        ctx.save();
        for (let pass = 0; pass < 3; pass++) {
          ctx.beginPath();
          const passOffset = pass * band.width * 0.3;

          for (let x = -10; x <= w + 10; x += 3) {
            const wave =
              Math.sin(x * band.frequency + time * band.speed) * band.amplitude +
              Math.sin(x * band.frequency * 2.5 + time * band.speed * 0.7) * band.amplitude * 0.4 +
              Math.sin(x * band.frequency * 0.5 + time * band.speed * 1.3) * band.amplitude * 0.6;

            const y = band.baseY + wave + passOffset;

            if (x === -10) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }

          // Close path to create a filled band
          ctx.lineTo(w + 10, band.baseY + band.width + passOffset);
          for (let x = w + 10; x >= -10; x -= 3) {
            const wave =
              Math.sin(x * band.frequency + time * band.speed + 1) * band.amplitude * 0.6 +
              Math.sin(x * band.frequency * 3 + time * band.speed * 0.5) * band.amplitude * 0.2;
            ctx.lineTo(x, band.baseY + wave + band.width + passOffset);
          }
          ctx.closePath();

          const gradient = ctx.createLinearGradient(0, band.baseY - 50, 0, band.baseY + band.width + 50);
          gradient.addColorStop(0, band.color1 + "0)");
          gradient.addColorStop(0.3, band.color1 + (band.opacity * (1 - pass * 0.3)).toFixed(2) + ")");
          gradient.addColorStop(0.5, band.color2 + (band.opacity * 0.8 * (1 - pass * 0.25)).toFixed(2) + ")");
          gradient.addColorStop(0.7, band.color1 + (band.opacity * 0.5 * (1 - pass * 0.3)).toFixed(2) + ")");
          gradient.addColorStop(1, band.color2 + "0)");

          ctx.fillStyle = gradient;
          ctx.fill();
        }
        ctx.restore();
      }

      // Vertical aurora rays
      ctx.save();
      for (let i = 0; i < 15; i++) {
        const rx = (Math.sin(i * 47.3 + time * 0.2) * 0.5 + 0.5) * w;
        const rayOpacity = (Math.sin(time * 0.8 + i * 3.7) * 0.5 + 0.5) * 0.06;
        const rayGrad = ctx.createLinearGradient(rx, 0, rx, h * 0.6);
        rayGrad.addColorStop(0, `rgba(110,231,255,${rayOpacity})`);
        rayGrad.addColorStop(0.5, `rgba(131,82,255,${rayOpacity * 0.5})`);
        rayGrad.addColorStop(1, "rgba(131,82,255,0)");
        ctx.fillStyle = rayGrad;
        ctx.fillRect(rx - 2, 0, 4, h * 0.6);
      }
      ctx.restore();

      // Mountain silhouettes
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const p of mountainPoints) {
        ctx.lineTo(p.x * w, p.y * h);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = "rgba(5,8,18,0.6)";
      ctx.fill();

      // Second mountain layer
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const p of mountainPoints) {
        ctx.lineTo(p.x * w, (p.y + 0.05) * h + Math.sin(p.x * 20) * 10);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = "rgba(3,5,14,0.5)";
      ctx.fill();

      // Floating particles
      for (const p of particles) {
        p.pulse += p.pulseSpeed;
        p.x += p.speedX;
        p.y += p.speedY;
        const pOpacity = p.opacity * (0.7 + Math.sin(p.pulse) * 0.3);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${pOpacity})`;
        ctx.fill();

        // Particle glow
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        pg.addColorStop(0, `rgba(${p.color},${pOpacity * 0.3})`);
        pg.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = pg;
        ctx.fillRect(p.x - p.size * 4, p.y - p.size * 4, p.size * 8, p.size * 8);

        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        if (p.x < -10 || p.x > w + 10) {
          p.x = Math.random() * w;
        }
      }

      // Reflection on "water" at bottom
      ctx.save();
      ctx.globalAlpha = 0.04;
      const reflY = h * 0.85;
      for (const band of auroraBands) {
        for (let x = 0; x < w; x += 8) {
          const wave = Math.sin(x * 0.01 + time * 2) * 3;
          const intensity = Math.sin(x * band.frequency + time * band.speed) * 0.5 + 0.5;
          ctx.fillStyle = band.color1 + (intensity * 0.4).toFixed(2) + ")";
          ctx.fillRect(x, reflY + wave, 6, 2);
        }
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
