const auroraBands = [
  { color: "rgba(0,255,180,1)", height: 80,  top: "10%", dur: "8s" },
  { color: "rgba(0,207,255,1)", height: 110, top: "25%", dur: "10s" },
  { color: "rgba(100,255,200,1)", height: 95, top: "40%", dur: "12s" },
];

const hexPoints = "10,0 20,5 20,15 10,20 0,15 0,5";
const crystals = [
  { x: "12%", y: "15%", size: 30, dur: "22s" },
  { x: "75%", y: "20%", size: 24, dur: "28s" },
  { x: "40%", y: "60%", size: 36, dur: "20s" },
  { x: "88%", y: "50%", size: 20, dur: "26s" },
  { x: "25%", y: "80%", size: 32, dur: "30s" },
  { x: "60%", y: "35%", size: 22, dur: "24s" },
  { x: "5%",  y: "55%", size: 28, dur: "25s" },
  { x: "50%", y: "85%", size: 40, dur: "21s" },
];

export default function GlacierBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #001428 0%, #002244 50%, #001428 100%)" }}>
      {auroraBands.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: "200%",
            height: b.height,
            borderRadius: "50%",
            opacity: 0.12 + i * 0.03,
            background: b.color,
            top: b.top,
            left: "-50%",
            filter: "blur(30px)",
            animation: `auroraShift ${b.dur} ease-in-out infinite alternate`,
          }}
        />
      ))}
      {crystals.map((c, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            width: c.size,
            height: c.size,
            animation: `crystalSpin ${c.dur} linear infinite`,
          }}
        >
          <polygon
            points={hexPoints}
            stroke="var(--monument-glacier)"
            strokeWidth="0.5"
            fill="none"
            opacity="0.15"
          />
        </svg>
      ))}
    </div>
  );
}
