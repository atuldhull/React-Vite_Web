const causticEllipses = [
  { w: 200, h: 80,  top: "12%", left: "15%", dur: "7s",  delay: "0s" },
  { w: 150, h: 60,  top: "28%", left: "55%", dur: "9s",  delay: "2s" },
  { w: 300, h: 100, top: "18%", left: "35%", dur: "6s",  delay: "4s" },
  { w: 180, h: 70,  top: "38%", left: "70%", dur: "10s", delay: "1s" },
];

const bioParticles = [
  { top: "8%",  left: "12%", dur: "5s",   delay: "0s" },
  { top: "15%", left: "45%", dur: "4s",   delay: "2s" },
  { top: "22%", left: "78%", dur: "6s",   delay: "5s" },
  { top: "30%", left: "30%", dur: "3.5s", delay: "1s" },
  { top: "38%", left: "62%", dur: "7s",   delay: "8s" },
  { top: "45%", left: "18%", dur: "4.5s", delay: "3s" },
  { top: "52%", left: "85%", dur: "5.5s", delay: "11s" },
  { top: "58%", left: "50%", dur: "3s",   delay: "6s" },
  { top: "65%", left: "25%", dur: "6.5s", delay: "14s" },
  { top: "72%", left: "70%", dur: "4s",   delay: "9s" },
  { top: "78%", left: "40%", dur: "5s",   delay: "4s" },
  { top: "85%", left: "90%", dur: "3.8s", delay: "12s" },
  { top: "20%", left: "55%", dur: "6s",   delay: "7s" },
  { top: "42%", left: "8%",  dur: "4.2s", delay: "10s" },
  { top: "60%", left: "35%", dur: "5.2s", delay: "15s" },
  { top: "33%", left: "92%", dur: "3.2s", delay: "2.5s" },
  { top: "50%", left: "65%", dur: "7s",   delay: "13s" },
  { top: "70%", left: "15%", dur: "4.8s", delay: "6.5s" },
  { top: "90%", left: "48%", dur: "5.8s", delay: "3.5s" },
  { top: "12%", left: "80%", dur: "3.5s", delay: "8.5s" },
];

export default function AbyssBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 30%, #001f3a 0%, #000d1a 60%, #000508 100%)" }}>
      {causticEllipses.map((c, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: c.w,
            height: c.h,
            borderRadius: "50%",
            opacity: 0.06,
            background: "rgba(0,255,200,1)",
            filter: "blur(20px)",
            top: c.top,
            left: c.left,
            animation: `causticDrift ${c.dur} ${c.delay} ease-in-out infinite alternate`,
          }}
        />
      ))}
      {bioParticles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: i % 2 === 0 ? "var(--monument-abyss)" : "#00FFAA",
            top: p.top,
            left: p.left,
            animation: `bioGlow ${p.dur} ${p.delay} ease-in-out infinite`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          width: "100%",
          height: "30%",
          background: "linear-gradient(to top, rgba(0,20,40,0.6), transparent)",
        }}
      />
    </div>
  );
}
