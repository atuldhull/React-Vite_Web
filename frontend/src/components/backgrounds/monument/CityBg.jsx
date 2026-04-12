const cityBuildings = [
  { x: 0,   y: 120, w: 60,  h: 180 },
  { x: 70,  y: 80,  w: 40,  h: 220 },
  { x: 120, y: 140, w: 80,  h: 160 },
  { x: 210, y: 60,  w: 50,  h: 240 },
  { x: 270, y: 110, w: 70,  h: 190 },
  { x: 350, y: 70,  w: 45,  h: 230 },
  { x: 405, y: 150, w: 65,  h: 150 },
  { x: 480, y: 90,  w: 55,  h: 210 },
  { x: 545, y: 130, w: 40,  h: 170 },
  { x: 595, y: 60,  w: 75,  h: 240 },
  { x: 680, y: 100, w: 50,  h: 200 },
  { x: 740, y: 140, w: 60,  h: 160 },
];

const cityWindows = [
  { x: 15,  y: 150, w: 4, h: 6 }, { x: 35,  y: 170, w: 4, h: 6 }, { x: 15,  y: 200, w: 4, h: 6 },
  { x: 80,  y: 110, w: 4, h: 6 }, { x: 90,  y: 150, w: 4, h: 6 }, { x: 80,  y: 190, w: 4, h: 6 },
  { x: 140, y: 170, w: 4, h: 6 }, { x: 160, y: 200, w: 4, h: 6 }, { x: 175, y: 170, w: 4, h: 6 },
  { x: 225, y: 90,  w: 4, h: 6 }, { x: 225, y: 130, w: 4, h: 6 }, { x: 240, y: 170, w: 4, h: 6 },
  { x: 290, y: 140, w: 4, h: 6 }, { x: 310, y: 180, w: 4, h: 6 }, { x: 290, y: 220, w: 4, h: 6 },
  { x: 365, y: 100, w: 4, h: 6 }, { x: 375, y: 150, w: 4, h: 6 }, { x: 365, y: 200, w: 4, h: 6 },
  { x: 425, y: 180, w: 4, h: 6 }, { x: 445, y: 210, w: 4, h: 6 },
  { x: 495, y: 120, w: 4, h: 6 }, { x: 510, y: 170, w: 4, h: 6 }, { x: 495, y: 220, w: 4, h: 6 },
  { x: 555, y: 160, w: 4, h: 6 }, { x: 565, y: 200, w: 4, h: 6 },
  { x: 615, y: 90,  w: 4, h: 6 }, { x: 635, y: 140, w: 4, h: 6 }, { x: 615, y: 190, w: 4, h: 6 }, { x: 645, y: 230, w: 4, h: 6 },
  { x: 695, y: 130, w: 4, h: 6 }, { x: 710, y: 180, w: 4, h: 6 },
  { x: 755, y: 170, w: 4, h: 6 }, { x: 775, y: 210, w: 4, h: 6 },
];

export default function CityBg() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#04000f" }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 800 300" preserveAspectRatio="none">
        <path d="M 0 150 Q 100 80, 200 150 Q 300 220, 400 150 Q 500 80, 600 150 Q 700 220, 800 150" stroke="var(--monument-city)" opacity="0.1" strokeWidth="1" fill="none" />
        <path d="M 50 300 Q 400 0, 750 300" stroke="var(--monument-city)" opacity="0.08" strokeWidth="1" fill="none" />
        <path d="M 0 280 C 100 270, 300 200, 800 10" stroke="var(--monument-city)" opacity="0.06" strokeWidth="1" fill="none" />
      </svg>
      <svg style={{ position: "absolute", bottom: 0, width: "100%", height: "50%" }} viewBox="0 0 800 300" preserveAspectRatio="xMidYMax slice">
        {cityBuildings.map((b, i) => (
          <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#120030" />
        ))}
        {cityWindows.map((w, i) => (
          <rect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} fill="var(--monument-city)" opacity="0.4" />
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1,
          height: "100%",
          background: "linear-gradient(to bottom, transparent, rgba(255,45,120,0.4), transparent)",
          animation: "scanMove 6s linear infinite",
        }}
      />
    </div>
  );
}
