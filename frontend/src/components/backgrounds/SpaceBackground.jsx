import { useEffect, useRef } from "react";

const STAR_COUNT = 220;
const SHIP_COUNT = 6;
const SHOOTING_STAR_INTERVAL = 3000;

function createStars(canvas) {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2.2 + 0.3,
    speed: Math.random() * 0.3 + 0.05,
    opacity: Math.random() * 0.7 + 0.3,
    twinkleSpeed: Math.random() * 0.02 + 0.005,
    twinklePhase: Math.random() * Math.PI * 2,
  }));
}

function createShip() {
  const fromLeft = Math.random() > 0.5;
  const y = Math.random() * 0.8 + 0.1;
  return {
    x: fromLeft ? -0.05 : 1.05,
    y,
    speed: (Math.random() * 0.0008 + 0.0003) * (fromLeft ? 1 : -1),
    size: Math.random() * 18 + 10,
    rotation: fromLeft ? Math.random() * 0.3 - 0.15 : Math.PI + Math.random() * 0.3 - 0.15,
    trail: [],
    color: ["#8352ff", "#23c1ff", "#6ee7ff", "#ff6b6b", "#fbbf24"][Math.floor(Math.random() * 5)],
    type: Math.floor(Math.random() * 3),
  };
}

function drawShip(ctx, ship, w, h) {
  const sx = ship.x * w;
  const sy = ship.y * h;
  const s = ship.size;

  // Engine trail
  for (let i = 0; i < ship.trail.length; i++) {
    const t = ship.trail[i];
    const alpha = (1 - i / ship.trail.length) * 0.4;
    ctx.beginPath();
    ctx.arc(t.x, t.y, s * 0.2 * (1 - i / ship.trail.length), 0, Math.PI * 2);
    ctx.fillStyle = ship.color + Math.floor(alpha * 255).toString(16).padStart(2, "0");
    ctx.fill();
  }

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ship.rotation);

  // Ship body
  if (ship.type === 0) {
    // Sleek fighter
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.4);
    ctx.lineTo(-s * 0.3, 0);
    ctx.lineTo(-s * 0.6, s * 0.4);
    ctx.closePath();
    ctx.fillStyle = ship.color + "cc";
    ctx.fill();
    ctx.strokeStyle = ship.color;
    ctx.lineWidth = 1;
    ctx.stroke();
    // Cockpit
    ctx.beginPath();
    ctx.arc(s * 0.3, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff88";
    ctx.fill();
  } else if (ship.type === 1) {
    // Cruiser
    ctx.beginPath();
    ctx.moveTo(s * 0.8, 0);
    ctx.lineTo(s * 0.2, -s * 0.5);
    ctx.lineTo(-s * 0.7, -s * 0.35);
    ctx.lineTo(-s * 0.5, 0);
    ctx.lineTo(-s * 0.7, s * 0.35);
    ctx.lineTo(s * 0.2, s * 0.5);
    ctx.closePath();
    ctx.fillStyle = ship.color + "bb";
    ctx.fill();
    ctx.strokeStyle = ship.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Wings
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.5);
    ctx.lineTo(-s * 0.5, -s * 0.8);
    ctx.lineTo(-s * 0.7, -s * 0.35);
    ctx.fillStyle = ship.color + "88";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, s * 0.5);
    ctx.lineTo(-s * 0.5, s * 0.8);
    ctx.lineTo(-s * 0.7, s * 0.35);
    ctx.fill();
  } else {
    // Small scout
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.6, s * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = ship.color + "bb";
    ctx.fill();
    ctx.strokeStyle = ship.color;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(s * 0.15, 0, s * 0.15, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffffaa";
    ctx.fill();
  }

  // Engine glow
  ctx.beginPath();
  ctx.arc(-s * 0.4, 0, s * 0.15, 0, Math.PI * 2);
  const glow = ctx.createRadialGradient(-s * 0.4, 0, 0, -s * 0.4, 0, s * 0.15);
  glow.addColorStop(0, ship.color + "ff");
  glow.addColorStop(1, ship.color + "00");
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.restore();
}

function createShootingStar(w, h) {
  return {
    x: Math.random() * w * 0.8,
    y: Math.random() * h * 0.4,
    length: Math.random() * 80 + 40,
    speed: Math.random() * 8 + 4,
    angle: Math.PI / 4 + Math.random() * 0.3,
    opacity: 1,
    life: 1,
  };
}

function createNebula() {
  return {
    x: Math.random(),
    y: Math.random(),
    radius: Math.random() * 0.2 + 0.1,
    color: ["131,82,255", "35,193,255", "110,231,255", "248,113,113"][
      Math.floor(Math.random() * 4)
    ],
    opacity: Math.random() * 0.06 + 0.02,
    drift: Math.random() * 0.00005,
  };
}

export default function SpaceBackground() {
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

    const stars = createStars(canvas);
    let ships = Array.from({ length: SHIP_COUNT }, createShip);
    let shootingStars = [];
    const nebulae = Array.from({ length: 5 }, createNebula);
    let time = 0;

    const shootingInterval = setInterval(() => {
      if (shootingStars.length < 2) {
        shootingStars.push(createShootingStar(w, h));
      }
    }, SHOOTING_STAR_INTERVAL);

    const animate = () => {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Nebula clouds
      for (const neb of nebulae) {
        neb.x += neb.drift;
        if (neb.x > 1.3) neb.x = -0.3;
        const grad = ctx.createRadialGradient(
          neb.x * w, neb.y * h, 0,
          neb.x * w, neb.y * h, neb.radius * w
        );
        grad.addColorStop(0, `rgba(${neb.color},${neb.opacity})`);
        grad.addColorStop(1, `rgba(${neb.color},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Stars
      for (const star of stars) {
        star.twinklePhase += star.twinkleSpeed;
        const flicker = star.opacity + Math.sin(star.twinklePhase) * 0.3;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, flicker)})`;
        ctx.fill();

        // Star glow
        if (star.size > 1.5) {
          const sg = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3);
          sg.addColorStop(0, `rgba(200,220,255,${flicker * 0.3})`);
          sg.addColorStop(1, "rgba(200,220,255,0)");
          ctx.fillStyle = sg;
          ctx.fillRect(star.x - star.size * 3, star.y - star.size * 3, star.size * 6, star.size * 6);
        }

        star.y += star.speed;
        if (star.y > h + 5) {
          star.y = -5;
          star.x = Math.random() * w;
        }
      }

      // Ships
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        ship.x += ship.speed;
        ship.trail.unshift({ x: ship.x * w, y: ship.y * h });
        if (ship.trail.length > 12) ship.trail.pop();
        ship.y += Math.sin(time * 2 + i) * 0.0003;
        drawShip(ctx, ship, w, h);

        if (ship.x < -0.15 || ship.x > 1.15) {
          ships[i] = createShip();
        }
      }

      // Shooting stars
      shootingStars = shootingStars.filter((ss) => {
        ss.x += Math.cos(ss.angle) * ss.speed;
        ss.y += Math.sin(ss.angle) * ss.speed;
        ss.life -= 0.015;
        ss.opacity = ss.life;

        if (ss.life <= 0) return false;

        ctx.save();
        ctx.globalAlpha = ss.opacity;
        const grad = ctx.createLinearGradient(
          ss.x, ss.y,
          ss.x - Math.cos(ss.angle) * ss.length,
          ss.y - Math.sin(ss.angle) * ss.length
        );
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.3, "#8352ff");
        grad.addColorStop(1, "transparent");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ss.x, ss.y);
        ctx.lineTo(
          ss.x - Math.cos(ss.angle) * ss.length,
          ss.y - Math.sin(ss.angle) * ss.length
        );
        ctx.stroke();
        ctx.restore();

        return true;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(shootingInterval);
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
