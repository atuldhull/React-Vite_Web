const skyStars = Array.from({ length: 40 }, (_, i) => ({
  left: `${(i * 17.3) % 98 + 1}%`,
  top: `${(i * 23.7) % 70}%`,
  size: 1 + (i % 2),
  dur: `${2 + (i % 4)}s`,
  delay: `${(i * 0.73) % 10}s`,
}));

export default function SkyBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0f0025 0%, #1a0840 40%, #0a0520 100%)" }}>
      {skyStars.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "white",
            animation: `starTwinkle ${s.dur} ${s.delay} ease-in-out infinite`,
          }}
        />
      ))}
      <svg
        viewBox="0 0 120 100"
        style={{ position: "absolute", left: "10%", top: "30%", width: 160, height: 130, animation: "islandDrift 8s ease-in-out infinite" }}
      >
        <polygon points="20,50 0,80 40,90 80,80 90,60 70,50 50,45" fill="#2a1060" opacity="0.5" />
        <rect x="35" y="32" width="4" height="14" fill="#3a1880" opacity="0.5" />
        <polygon points="37,22 30,36 44,36" fill="#3a1880" opacity="0.4" />
        <rect x="60" y="36" width="3" height="12" fill="#3a1880" opacity="0.5" />
        <polygon points="61,28 55,40 68,40" fill="#3a1880" opacity="0.4" />
      </svg>
      <svg
        viewBox="0 0 100 80"
        style={{ position: "absolute", right: "12%", top: "20%", width: 120, height: 100, animation: "islandDrift 8s 1s ease-in-out infinite" }}
      >
        <polygon points="15,40 0,65 30,72 65,65 75,48 55,40 40,36" fill="#2a1060" opacity="0.5" />
        <rect x="30" y="26" width="3" height="12" fill="#3a1880" opacity="0.5" />
        <polygon points="31,18 25,30 38,30" fill="#3a1880" opacity="0.4" />
      </svg>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bridgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--monument-sky)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="var(--monument-sky)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--monument-sky)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M 120 140 Q 400 80, 660 100"
          stroke="url(#bridgeGrad)"
          strokeWidth="1"
          fill="none"
          opacity="0.15"
        />
      </svg>
    </div>
  );
}
