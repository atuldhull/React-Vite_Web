import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export default function FeaturedCard({ file, label, sublabel, onClick, variant = "gold" }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [-40, 40]);
  const isGold = variant === "gold";

  const border = isGold ? "border-[#8B6340]/40" : "border-[#5a2080]/40";
  const hoverBorder = isGold ? "hover:border-[#e8c070]/60" : "hover:border-[#c060e0]/60";
  const glow = isGold
    ? "hover:shadow-[0_30px_80px_rgba(200,144,42,0.2)]"
    : "hover:shadow-[0_30px_80px_rgba(192,96,224,0.15)]";
  const accent = isGold ? "text-[#e8c070]" : "text-[#d0a0ff]";
  const sub = isGold ? "text-[#8a5a30]" : "text-[#6b3fa0]";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 80 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.015 }}
      className={`group relative mb-10 cursor-pointer overflow-hidden rounded-3xl border-2 ${border} ${hoverBorder} ${glow} transition-all duration-500`}
      onClick={() => file.type === "img" && onClick(file.url)}
    >
      <div className="relative h-[340px] overflow-hidden sm:h-[440px] lg:h-[520px]">
        <motion.img
          src={file.url}
          alt={label}
          loading="lazy"
          style={{ y: imgY }}
          className="h-[120%] w-full object-cover transition-transform duration-[1s] group-hover:scale-105"
        />
        {/* Deep gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
      </div>

      {/* Content overlay */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-8 sm:p-10">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          {sublabel && (
            <p className={`font-mono text-[10px] uppercase tracking-[5px] ${sub}`}>{sublabel}</p>
          )}
          <h3 className={`mt-3 font-display text-4xl font-bold tracking-wide sm:text-5xl ${accent}`}
            style={{ textShadow: `0 0 40px ${isGold ? "rgba(232,192,112,0.3)" : "rgba(208,160,255,0.3)"}` }}>
            {label}
          </h3>
        </motion.div>
      </div>

      {/* Corner accents */}
      <svg className="pointer-events-none absolute left-4 top-4 h-12 w-12 opacity-0 transition-opacity group-hover:opacity-40" viewBox="0 0 48 48">
        <path d="M2 16 L2 2 L16 2" stroke={isGold ? "#e8c070" : "#c060e0"} strokeWidth="2" fill="none" />
      </svg>
      <svg className="pointer-events-none absolute bottom-4 right-4 h-12 w-12 opacity-0 transition-opacity group-hover:opacity-40" viewBox="0 0 48 48">
        <path d="M46 32 L46 46 L32 46" stroke={isGold ? "#e8c070" : "#c060e0"} strokeWidth="2" fill="none" />
      </svg>
    </motion.div>
  );
}
