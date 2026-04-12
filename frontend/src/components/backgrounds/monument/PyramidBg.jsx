import { useMemo } from "react";

const pyramidPulseDots = [
  { cx: 180, cy: 180, dur: "2.5s" },
  { cx: 220, cy: 200, dur: "3s" },
  { cx: 200, cy: 120, dur: "3.5s" },
  { cx: 150, cy: 240, dur: "2s" },
  { cx: 260, cy: 230, dur: "4s" },
];

export default function PyramidBg() {
  const stars = useMemo(() => {
    const s = [];
    for (let i = 0; i < 30; i++) {
      s.push({
        cx: (i * 137.5) % 400,
        cy: ((i * 89.3) % 180),
        r: 0.5 + (i % 3) * 0.25,
      });
    }
    return s;
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 80%, #12004a 0%, #080020 50%, #030010 100%)" }}>
      <svg
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMax meet"
        style={{ position: "absolute", width: "100%", height: "100%", bottom: 0 }}
      >
        {stars.map((s, i) => (
          <circle key={`s${i}`} cx={s.cx} cy={s.cy} r={s.r} fill="white" opacity="0.4" />
        ))}
        <line x1="200" y1="20" x2="40"  y2="280" stroke="var(--monument-pyramid)" strokeWidth="0.8" opacity="0.3" />
        <line x1="200" y1="20" x2="160" y2="220" stroke="var(--monument-pyramid)" strokeWidth="0.8" opacity="0.3" />
        <line x1="200" y1="20" x2="240" y2="220" stroke="var(--monument-pyramid)" strokeWidth="0.8" opacity="0.3" />
        <line x1="200" y1="20" x2="360" y2="280" stroke="var(--monument-pyramid)" strokeWidth="0.8" opacity="0.3" />
        <line x1="40"  y1="280" x2="360" y2="280" stroke="var(--monument-pyramid)" strokeWidth="0.8" opacity="0.3" />
        <line x1="160" y1="220" x2="240" y2="220" stroke="var(--monument-pyramid)" strokeWidth="0.8" opacity="0.3" />
        {pyramidPulseDots.map((d, i) => (
          <circle
            key={`p${i}`}
            cx={d.cx}
            cy={d.cy}
            r="2"
            fill="var(--monument-pyramid)"
            style={{ animation: `pyramidPulse ${d.dur} ease-in-out infinite alternate` }}
          />
        ))}
      </svg>
    </div>
  );
}
