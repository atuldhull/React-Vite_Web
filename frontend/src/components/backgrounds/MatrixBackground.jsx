import { useEffect, useRef } from "react";

const COLUMN_SPACING = 22;
const STREAM_CHARS = "01アイウエオカキクケコサシスセソタチツテトMATH∑∏∫∂√∞≈≠±×÷πΔΩλ";

function createStream(x, h) {
  const length = Math.floor(Math.random() * 25) + 8;
  return {
    x,
    y: Math.random() * h * 0.5 - h * 0.5,
    speed: Math.random() * 2.5 + 1,
    chars: Array.from({ length }, () => ({
      char: STREAM_CHARS[Math.floor(Math.random() * STREAM_CHARS.length)],
      changeTimer: Math.random() * 100,
    })),
    opacity: Math.random() * 0.5 + 0.3,
    fontSize: Math.random() > 0.7 ? 16 : 13,
    highlight: Math.random() > 0.85,
  };
}

function createDataPacket(w, h) {
  const fromLeft = Math.random() > 0.5;
  return {
    x: fromLeft ? -20 : w + 20,
    y: Math.random() * h,
    speed: (Math.random() * 3 + 1.5) * (fromLeft ? 1 : -1),
    size: Math.random() * 4 + 2,
    trail: [],
    color: ["131,82,255", "35,193,255", "45,212,191"][Math.floor(Math.random() * 3)],
    life: 1,
  };
}

function createPulseRing(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    radius: 0,
    maxRadius: Math.random() * 100 + 50,
    speed: Math.random() * 1.5 + 0.5,
    opacity: 0.15,
    color: ["131,82,255", "35,193,255", "110,231,255"][Math.floor(Math.random() * 3)],
  };
}

export default function MatrixBackground() {
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

    const columns = Math.ceil(w / COLUMN_SPACING);
    let streams = Array.from({ length: columns }, (_, i) =>
      createStream(i * COLUMN_SPACING + COLUMN_SPACING / 2, h)
    );

    let dataPackets = [];
    let pulseRings = [];
    let time = 0;

    const packetInterval = setInterval(() => {
      if (dataPackets.length < 8) {
        dataPackets.push(createDataPacket(w, h));
      }
    }, 800);

    const pulseInterval = setInterval(() => {
      if (pulseRings.length < 3) {
        pulseRings.push(createPulseRing(w, h));
      }
    }, 2000);

    // Circuit board nodes
    const nodes = Array.from({ length: 20 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      connections: [],
      pulse: Math.random() * Math.PI * 2,
    }));
    // Connect nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < 250) {
          nodes[i].connections.push(j);
        }
      }
    }

    const animate = () => {
      time += 0.016;

      // Fade effect for trails
      ctx.fillStyle = "rgba(3,7,18,0.08)";
      ctx.fillRect(0, 0, w, h);

      // Circuit connections
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.strokeStyle = "#8352ff";
      ctx.lineWidth = 0.8;
      for (const node of nodes) {
        node.pulse += 0.02;
        for (const conn of node.connections) {
          const target = nodes[conn];
          // Data flow animation on the connection
          const flowPos = (time * 0.5) % 1;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          // Right-angle connections for circuit board look
          const midX = (node.x + target.x) / 2;
          ctx.lineTo(midX, node.y);
          ctx.lineTo(midX, target.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();

          // Moving dot
          const dotX = node.x + (target.x - node.x) * flowPos;
          const dotY = node.y + (target.y - node.y) * flowPos;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(110,231,255,0.3)";
          ctx.fill();
        }

        // Node dot
        const nodeGlow = 0.5 + Math.sin(node.pulse) * 0.3;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(131,82,255,${nodeGlow * 0.2})`;
        ctx.fill();
      }
      ctx.restore();

      // Matrix rain streams
      ctx.font = "13px 'IBM Plex Mono', monospace";
      for (const stream of streams) {
        stream.y += stream.speed;

        for (let i = 0; i < stream.chars.length; i++) {
          const charY = stream.y + i * (stream.fontSize + 2);
          if (charY < -20 || charY > h + 20) continue;

          const charData = stream.chars[i];
          charData.changeTimer--;
          if (charData.changeTimer <= 0) {
            charData.char = STREAM_CHARS[Math.floor(Math.random() * STREAM_CHARS.length)];
            charData.changeTimer = Math.random() * 60 + 10;
          }

          const isHead = i === 0;
          const fadeout = 1 - i / stream.chars.length;
          const alpha = stream.opacity * fadeout;

          if (isHead) {
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.shadowColor = stream.highlight ? "#6ee7ff" : "#23c1ff";
            ctx.shadowBlur = 8;
          } else if (stream.highlight && i < 3) {
            ctx.fillStyle = `rgba(110,231,255,${alpha})`;
            ctx.shadowBlur = 0;
          } else {
            ctx.fillStyle = `rgba(131,82,255,${alpha * 0.8})`;
            ctx.shadowBlur = 0;
          }

          ctx.font = `${stream.fontSize}px 'IBM Plex Mono', monospace`;
          ctx.fillText(charData.char, stream.x, charY);
        }
        ctx.shadowBlur = 0;

        if (stream.y > h + stream.chars.length * (stream.fontSize + 2)) {
          Object.assign(stream, createStream(stream.x, h));
        }
      }

      // Data packets
      dataPackets = dataPackets.filter((dp) => {
        dp.x += dp.speed;
        dp.trail.unshift({ x: dp.x, y: dp.y });
        if (dp.trail.length > 20) dp.trail.pop();

        // Trail
        for (let i = 0; i < dp.trail.length; i++) {
          const ta = (1 - i / dp.trail.length) * 0.4;
          ctx.beginPath();
          ctx.arc(dp.trail[i].x, dp.trail[i].y, dp.size * (1 - i / dp.trail.length), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${dp.color},${ta})`;
          ctx.fill();
        }

        // Main packet
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, dp.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${dp.color},0.7)`;
        ctx.fill();

        return dp.x > -50 && dp.x < w + 50;
      });

      // Pulse rings
      pulseRings = pulseRings.filter((pr) => {
        pr.radius += pr.speed;
        pr.opacity -= 0.001;

        if (pr.radius > pr.maxRadius || pr.opacity <= 0) return false;

        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${pr.color},${pr.opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        return true;
      });

      // Hex grid overlay
      ctx.save();
      ctx.globalAlpha = 0.015;
      ctx.strokeStyle = "#8352ff";
      ctx.lineWidth = 0.5;
      const hexSize = 40;
      for (let row = 0; row < h / (hexSize * 1.5) + 1; row++) {
        for (let col = 0; col < w / (hexSize * 1.73) + 1; col++) {
          const hx = col * hexSize * 1.73 + (row % 2 ? hexSize * 0.865 : 0);
          const hy = row * hexSize * 1.5;
          ctx.beginPath();
          for (let s = 0; s < 6; s++) {
            const angle = (Math.PI / 3) * s - Math.PI / 6;
            const px = hx + hexSize * 0.5 * Math.cos(angle);
            const py = hy + hexSize * 0.5 * Math.sin(angle);
            s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();

      animRef.current = requestAnimationFrame(animate);
    };

    // Initial clear
    ctx.fillStyle = "rgba(3,7,18,1)";
    ctx.fillRect(0, 0, w, h);

    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(packetInterval);
      clearInterval(pulseInterval);
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
