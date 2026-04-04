import { useEffect, useRef } from "react";

// Canvas ring that orbits around the panda button
export function OrbitRing({ size = 80, active = false }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const s = size * 2; // retina
    canvas.width = s;
    canvas.height = s;
    let t = 0;

    const draw = () => {
      t += 0.02;
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2, r = s / 2 - 8;

      // Outer orbit ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = active ? "rgba(131,82,255,0.25)" : "rgba(131,82,255,0.1)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Orbiting dots
      const dotCount = active ? 4 : 2;
      for (let i = 0; i < dotCount; i++) {
        const angle = t * (1.2 + i * 0.3) + i * ((Math.PI * 2) / dotCount);
        const dx = cx + Math.cos(angle) * r;
        const dy = cy + Math.sin(angle) * r;
        const dotR = active ? 3.5 : 2.5;

        const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, dotR * 3);
        grad.addColorStop(0, i % 2 === 0 ? "rgba(131,82,255,0.9)" : "rgba(110,231,255,0.9)");
        grad.addColorStop(1, "rgba(131,82,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(dx - dotR * 3, dy - dotR * 3, dotR * 6, dotR * 6);

        ctx.beginPath();
        ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? "#8352ff" : "#6ee7ff";
        ctx.fill();
      }

      // Inner pulse ring
      const pulseR = r * 0.75 + Math.sin(t * 2) * 4;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110,231,255,${0.06 + Math.sin(t * 2) * 0.04})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, active]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0"
      style={{ width: size, height: size }}
    />
  );
}

// Ripple burst effect on open
export function RippleBurst({ active }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: 20 + i * 30,
            height: 20 + i * 30,
            borderColor: i % 2 === 0 ? "rgba(131,82,255,0.3)" : "rgba(110,231,255,0.2)",
            animation: `pandaRipple 1s ${i * 0.12}s ease-out forwards`,
          }}
        />
      ))}
      {/* Energy particles */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <div
            key={`p${i}`}
            className="absolute h-1.5 w-1.5 rounded-full"
            style={{
              background: i % 2 === 0 ? "#8352ff" : "#6ee7ff",
              animation: `pandaParticle 0.8s ${i * 0.05}s ease-out forwards`,
              transform: `rotate(${angle}rad)`,
              transformOrigin: "center center",
            }}
          />
        );
      })}
    </div>
  );
}
