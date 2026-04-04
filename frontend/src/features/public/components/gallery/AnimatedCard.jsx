import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState } from "react";

export default function AnimatedCard({ file, index, onClick, variant = "gold", size = "normal" }) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const isGold = variant === "gold";

  // 3D tilt
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(mouseY, [0, 1], [8, -8]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-8, 8]), { stiffness: 200, damping: 20 });
  const glareX = useTransform(mouseX, [0, 1], [0, 100]);
  const glareY = useTransform(mouseY, [0, 1], [0, 100]);

  const handleMouse = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleLeave = () => { mouseX.set(0.5); mouseY.set(0.5); };

  const heightMap = { hero: "h-[420px] sm:h-[500px]", tall: "h-[380px] sm:h-[440px]", wide: "h-[220px] sm:h-[260px]", normal: "h-[240px] sm:h-[280px]", fill: "h-full" };
  const spanMap = { hero: "col-span-2 row-span-2", tall: "row-span-2", wide: "col-span-2", normal: "", fill: "" };

  const borderColor = isGold ? "border-[#5a3818]/50" : "border-[#2d1250]/50";
  const hoverBorder = isGold ? "group-hover:border-[#e8c070]/70" : "group-hover:border-[#c060e0]/70";
  const glowColor = isGold ? "rgba(200,144,42,0.25)" : "rgba(192,96,224,0.2)";
  const labelColor = isGold ? "text-[#e8c070]" : "text-[#d0a0ff]";
  const numBg = isGold ? "bg-[#c8902a]" : "bg-[#9040c0]";

  return (
    <motion.div
      className={`${spanMap[size]} group relative [perspective:800px]`}
      initial={{ opacity: 0, y: 60, rotateX: -5 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        delay: index * 0.04,
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <motion.div
        ref={ref}
        onMouseMove={handleMouse}
        onMouseLeave={handleLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        whileHover={{ scale: 1.03, boxShadow: `0 20px 60px ${glowColor}` }}
        transition={{ type: "spring", stiffness: 250, damping: 18 }}
        className={`relative ${heightMap[size]} cursor-pointer overflow-hidden rounded-2xl border-2 ${borderColor} ${hoverBorder} transition-colors duration-500`}
        onClick={() => file.type === "img" && onClick(file.url)}
      >
        {/* Shimmer loader */}
        {!loaded && (
          <div className="absolute inset-0 z-30">
            <div className="h-full w-full animate-pulse bg-gradient-to-r from-white/[0.02] via-white/[0.06] to-white/[0.02]" />
          </div>
        )}

        {/* Image / Video */}
        {file.type === "img" ? (
          <motion.img
            src={file.url}
            alt={file.label || `Photo ${index + 1}`}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="h-full w-full object-cover transition-transform duration-[800ms] ease-out group-hover:scale-[1.12]"
            style={{ transform: "translateZ(0)" }}
          />
        ) : (
          <video controls muted playsInline preload="metadata"
            onLoadedData={() => setLoaded(true)}
            className="h-full w-full object-cover">
            <source src={file.url} type="video/mp4" />
          </video>
        )}

        {/* 3D glare overlay */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: useTransform(
              [glareX, glareY],
              ([gx, gy]) => `radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.12) 0%, transparent 50%)`
            ),
          }}
        />

        {/* Sweep shine */}
        <div className="pointer-events-none absolute inset-0 z-20 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent transition-transform duration-700 group-hover:translate-x-full" />

        {/* Bottom vignette */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        {/* Label */}
        {file.label && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.04 + 0.3 }}
            className="absolute bottom-0 left-0 right-0 z-20 p-4"
            style={{ transform: "translateZ(30px)" }}
          >
            <p className={`font-mono text-[10px] uppercase tracking-[4px] ${labelColor} drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]`}>
              {file.label}
            </p>
          </motion.div>
        )}

        {/* Number badge */}
        <div className={`absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full ${numBg}/90 font-mono text-[10px] font-bold text-white shadow-lg backdrop-blur-sm`}
          style={{ transform: "translateZ(20px)" }}>
          {index + 1}
        </div>

        {/* Video badge */}
        {file.type === "vid" && (
          <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm"
            style={{ transform: "translateZ(20px)" }}>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/90">Video</span>
          </div>
        )}

        {/* Edge glow on hover */}
        <div className={`pointer-events-none absolute inset-0 rounded-2xl border-2 border-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${
          isGold ? "group-hover:border-[#e8c070]/20 group-hover:shadow-[inset_0_0_30px_rgba(232,192,112,0.06)]"
            : "group-hover:border-[#c060e0]/20 group-hover:shadow-[inset_0_0_30px_rgba(192,96,224,0.06)]"
        }`} />
      </motion.div>
    </motion.div>
  );
}
