const desertSymbols = [
  { char: "\u2211", size: "2.5rem", left: "8%",  dur: "12s", delay: "0s" },
  { char: "\u222B", size: "2rem",   left: "20%", dur: "14s", delay: "2s" },
  { char: "\u03C0", size: "3rem",   left: "35%", dur: "10s", delay: "5s" },
  { char: "\u03C6", size: "1.8rem", left: "52%", dur: "16s", delay: "1s" },
  { char: "\u221E", size: "2.2rem", left: "68%", dur: "11s", delay: "7s" },
  { char: "\u0394", size: "1.5rem", left: "85%", dur: "13s", delay: "4s" },
];

export default function DesertBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, #3d1f00 0%, #1a0800 60%, #0a0400 100%)" }}>
      {desertSymbols.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: s.left,
            bottom: "-10%",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: s.size,
            color: "var(--monument-desert)",
            opacity: 0.25,
            animation: `desertFloat ${s.dur} ${s.delay} linear infinite`,
            pointerEvents: "none",
          }}
        >
          {s.char}
        </span>
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "40%",
          background: "linear-gradient(to top, rgba(212,160,23,0.08) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}
