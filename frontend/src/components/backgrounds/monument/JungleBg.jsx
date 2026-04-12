const vinePath = "M 30 0 C 10 100, 50 200, 20 300 C 0 400, 40 500, 15 700 C 5 900, 35 1000, 20 1100";

const fireflies = [
  { top: "25%", left: "30%", dur: "3s",   delay: "0s" },
  { top: "40%", left: "55%", dur: "4s",   delay: "1.5s" },
  { top: "60%", left: "22%", dur: "2.5s", delay: "3s" },
  { top: "35%", left: "70%", dur: "3.5s", delay: "0.5s" },
  { top: "55%", left: "45%", dur: "5s",   delay: "2s" },
  { top: "70%", left: "60%", dur: "2s",   delay: "6s" },
  { top: "28%", left: "78%", dur: "4.5s", delay: "4s" },
  { top: "45%", left: "35%", dur: "3s",   delay: "7s" },
  { top: "65%", left: "50%", dur: "3.8s", delay: "1s" },
  { top: "50%", left: "25%", dur: "2.8s", delay: "5s" },
  { top: "30%", left: "65%", dur: "4.2s", delay: "3.5s" },
  { top: "75%", left: "40%", dur: "3.2s", delay: "8s" },
  { top: "38%", left: "80%", dur: "2.2s", delay: "2.5s" },
  { top: "58%", left: "72%", dur: "4.8s", delay: "6.5s" },
  { top: "48%", left: "28%", dur: "3.6s", delay: "4.5s" },
];

export default function JungleBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 100%, #002a0a 0%, #001208 50%, #000a04 100%)" }}>
      <svg
        style={{ position: "absolute", left: 0, top: 0, width: 60, height: "100%" }}
        viewBox="0 0 60 1100"
        preserveAspectRatio="none"
      >
        <path
          d={vinePath}
          stroke="var(--monument-jungle)"
          strokeWidth="1.5"
          fill="none"
          opacity="0.2"
          strokeDasharray="8 8"
          style={{ animation: "vineGrow 3s linear infinite" }}
        />
      </svg>
      <svg
        style={{ position: "absolute", right: 0, top: 0, width: 60, height: "100%", transform: "scaleX(-1)" }}
        viewBox="0 0 60 1100"
        preserveAspectRatio="none"
      >
        <path
          d={vinePath}
          stroke="var(--monument-jungle)"
          strokeWidth="1.5"
          fill="none"
          opacity="0.2"
          strokeDasharray="8 8"
          style={{ animation: "vineGrow 3s linear infinite" }}
        />
      </svg>
      {fireflies.map((f, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: f.top,
            left: f.left,
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "#90EE90",
            animation: `fireflyBlink ${f.dur} ${f.delay} ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
