import { useEffect, useRef } from "react";

const ORB_COUNT = 18;

export default function BackgroundEffects() {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w, h;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = document.documentElement.scrollHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const orbs = Array.from({ length: ORB_COUNT }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 180 + 60,
      dx: (Math.random() - 0.5) * 0.00008,
      dy: (Math.random() - 0.5) * 0.00006,
      hue: Math.random() > 0.5 ? "131,82,255" : Math.random() > 0.5 ? "35,193,255" : "200,100,40",
      opacity: Math.random() * 0.04 + 0.015,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: Math.random() * 0.008 + 0.003,
    }));

    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.4 + 0.1,
      drift: (Math.random() - 0.5) * 0.2,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      for (const orb of orbs) {
        orb.x += orb.dx;
        orb.y += orb.dy;
        orb.pulse += orb.pulseSpeed;
        if (orb.x < -0.1 || orb.x > 1.1) orb.dx *= -1;
        if (orb.y < -0.05 || orb.y > 1.05) orb.dy *= -1;

        const op = orb.opacity * (0.7 + Math.sin(orb.pulse) * 0.3);
        const grad = ctx.createRadialGradient(orb.x * w, orb.y * h, 0, orb.x * w, orb.y * h, orb.r);
        grad.addColorStop(0, `rgba(${orb.hue},${op})`);
        grad.addColorStop(1, `rgba(${orb.hue},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10 || p.x > w + 10) p.x = Math.random() * w;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />;
}
