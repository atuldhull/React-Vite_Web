const embers = [
  { left: "8%",  bottom: "2%",  dur: "5s",   delay: "0s" },
  { left: "18%", bottom: "5%",  dur: "7s",   delay: "1.5s" },
  { left: "28%", bottom: "0%",  dur: "4.5s", delay: "3s" },
  { left: "38%", bottom: "8%",  dur: "6s",   delay: "5s" },
  { left: "48%", bottom: "3%",  dur: "8s",   delay: "2s" },
  { left: "58%", bottom: "6%",  dur: "4s",   delay: "7s" },
  { left: "68%", bottom: "1%",  dur: "6.5s", delay: "4s" },
  { left: "78%", bottom: "9%",  dur: "5.5s", delay: "9s" },
  { left: "88%", bottom: "4%",  dur: "7.5s", delay: "6s" },
  { left: "15%", bottom: "7%",  dur: "4.8s", delay: "10s" },
  { left: "55%", bottom: "2%",  dur: "6.2s", delay: "8s" },
  { left: "92%", bottom: "5%",  dur: "5.2s", delay: "3.5s" },
];

export default function MagmaBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, #200800 0%, #100200 60%, #050000 100%)" }}>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "25%",
          background: "linear-gradient(to top, rgba(255,80,0,0.15), transparent)",
        }}
      />
      <svg style={{ position: "absolute", bottom: 0, width: "100%", height: "40%" }} viewBox="0 0 900 250" preserveAspectRatio="none">
        <path
          d="M 0 200 C 100 150, 200 180, 300 140 C 400 100, 500 160, 600 120 C 700 80, 800 150, 900 100"
          stroke="var(--monument-magma)"
          strokeWidth="2"
          fill="none"
          opacity="0.2"
          strokeDasharray="10 5"
          style={{ animation: "lavaFlow 4s linear infinite" }}
        />
        <path
          d="M 0 240 C 150 200, 250 220, 400 190 C 550 160, 650 200, 800 170"
          stroke="var(--monument-magma)"
          strokeWidth="2"
          fill="none"
          opacity="0.2"
          strokeDasharray="10 5"
          style={{ animation: "lavaFlow 4s 1s linear infinite" }}
        />
      </svg>
      {embers.map((e, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: e.left,
            bottom: e.bottom,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: i % 2 === 0 ? "var(--monument-magma)" : "#FF4500",
            animation: `emberRise ${e.dur} ${e.delay} ease-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
