import { useEffect, useRef } from "react";

const ASTEROID_COUNT = 35;
const STAR_COUNT = 180;
const LASER_INTERVAL = 2500;

function createAsteroid(w, h) {
  const size = Math.random() * 30 + 8;
  return {
    x: Math.random() * w * 1.4 - w * 0.2,
    y: Math.random() * h * 1.4 - h * 0.2,
    size,
    speedX: (Math.random() - 0.5) * 0.8,
    speedY: (Math.random() - 0.5) * 0.6,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.015,
    vertices: Array.from({ length: Math.floor(Math.random() * 4) + 6 }, (_, i) => {
      const angle = (i / (Math.floor(Math.random() * 4) + 6)) * Math.PI * 2;
      const r = size * (0.6 + Math.random() * 0.4);
      return { angle, r };
    }),
    color: ["#4a3a5a", "#5a4a3a", "#3a4a5a", "#6a5a4a"][Math.floor(Math.random() * 4)],
    glowColor: ["131,82,255", "35,193,255", "248,113,113"][Math.floor(Math.random() * 3)],
  };
}

function createStar(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    size: Math.random() * 1.8 + 0.2,
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: Math.random() * 0.03 + 0.01,
  };
}

function createLaser(w, h) {
  const startX = Math.random() * w;
  const startY = Math.random() * h * 0.3;
  const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.8;
  return {
    x: startX,
    y: startY,
    angle,
    speed: 6 + Math.random() * 4,
    length: 40 + Math.random() * 30,
    life: 1,
    color: Math.random() > 0.5 ? "#ff4444" : "#44ff44",
  };
}

function createExplosion(x, y) {
  return {
    x,
    y,
    particles: Array.from({ length: 12 }, () => ({
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      size: Math.random() * 3 + 1,
      life: 1,
    })),
    color: ["#ff6b6b", "#fbbf24", "#ff8844"][Math.floor(Math.random() * 3)],
  };
}

export default function AsteroidFieldBackground() {
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

    const stars = Array.from({ length: STAR_COUNT }, () => createStar(w, h));
    let asteroids = Array.from({ length: ASTEROID_COUNT }, () => createAsteroid(w, h));
    let lasers = [];
    let explosions = [];
    let time = 0;

    const laserInterval = setInterval(() => {
      if (lasers.length < 4) {
        lasers.push(createLaser(w, h));
      }
    }, LASER_INTERVAL);

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Distant nebula
      const neb1 = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.3);
      neb1.addColorStop(0, "rgba(131,82,255,0.06)");
      neb1.addColorStop(1, "rgba(131,82,255,0)");
      ctx.fillStyle = neb1;
      ctx.fillRect(0, 0, w, h);

      const neb2 = ctx.createRadialGradient(w * 0.7, h * 0.6, 0, w * 0.7, h * 0.6, w * 0.25);
      neb2.addColorStop(0, "rgba(248,113,113,0.04)");
      neb2.addColorStop(1, "rgba(248,113,113,0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, w, h);

      // Stars
      for (const star of stars) {
        star.twinkle += star.twinkleSpeed;
        const opacity = 0.4 + Math.sin(star.twinkle) * 0.3;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx.fill();
      }

      // Asteroids
      for (let i = 0; i < asteroids.length; i++) {
        const a = asteroids[i];
        a.x += a.speedX;
        a.y += a.speedY;
        a.rotation += a.rotSpeed;

        // Wrap around
        if (a.x < -a.size * 2) a.x = w + a.size;
        if (a.x > w + a.size * 2) a.x = -a.size;
        if (a.y < -a.size * 2) a.y = h + a.size;
        if (a.y > h + a.size * 2) a.y = -a.size;

        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rotation);

        // Shadow/glow
        ctx.beginPath();
        for (let j = 0; j < a.vertices.length; j++) {
          const v = a.vertices[j];
          const px = Math.cos(v.angle) * v.r;
          const py = Math.sin(v.angle) * v.r;
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();

        // Fill
        const grad = ctx.createRadialGradient(
          -a.size * 0.2, -a.size * 0.2, 0,
          0, 0, a.size
        );
        grad.addColorStop(0, a.color + "ee");
        grad.addColorStop(1, a.color + "88");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = `rgba(${a.glowColor},0.3)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Surface detail
        ctx.beginPath();
        ctx.arc(a.size * 0.15, -a.size * 0.1, a.size * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-a.size * 0.25, a.size * 0.2, a.size * 0.12, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Lasers
      lasers = lasers.filter((laser) => {
        laser.x += Math.cos(laser.angle) * laser.speed;
        laser.y += Math.sin(laser.angle) * laser.speed;
        laser.life -= 0.008;

        if (laser.life <= 0) return false;

        ctx.save();
        ctx.globalAlpha = laser.life;
        ctx.strokeStyle = laser.color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = laser.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(
          laser.x - Math.cos(laser.angle) * laser.length,
          laser.y - Math.sin(laser.angle) * laser.length
        );
        ctx.stroke();
        ctx.restore();

        // Check asteroid collision
        for (let i = 0; i < asteroids.length; i++) {
          const a = asteroids[i];
          const dx = laser.x - a.x;
          const dy = laser.y - a.y;
          if (Math.sqrt(dx * dx + dy * dy) < a.size) {
            explosions.push(createExplosion(a.x, a.y));
            asteroids[i] = createAsteroid(w, h);
            return false;
          }
        }

        return laser.x > -50 && laser.x < w + 50 && laser.y > -50 && laser.y < h + 50;
      });

      // Explosions
      explosions = explosions.filter((exp) => {
        let alive = false;
        for (const p of exp.particles) {
          p.x = (p.x || 0) + p.vx;
          p.y = (p.y || 0) + p.vy;
          p.life -= 0.025;
          if (p.life > 0) {
            alive = true;
            ctx.beginPath();
            ctx.arc(exp.x + p.x, exp.y + p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fillStyle = exp.color + Math.floor(p.life * 200).toString(16).padStart(2, "0");
            ctx.fill();
          }
        }
        return alive;
      });

      // Floating grid lines for depth
      ctx.save();
      ctx.globalAlpha = 0.03;
      ctx.strokeStyle = "#8352ff";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 8; i++) {
        const offset = (time * 30 + i * h / 8) % h;
        ctx.beginPath();
        ctx.moveTo(0, offset);
        ctx.lineTo(w, offset);
        ctx.stroke();
      }
      ctx.restore();

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(laserInterval);
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
