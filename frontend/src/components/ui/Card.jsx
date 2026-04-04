import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

const variantMap = {
  glass: "border-line/20 bg-surface/70 shadow-panel",
  glow: "border-primary/25 bg-primary/10 shadow-orbit",
  solid: "border-line/15 bg-panel/80 shadow-panel",
};

export default function Card({
  eyebrow,
  title,
  description,
  variant = "glass",
  interactive = false,
  footer,
  className,
  children,
  ...props
}) {
  return (
    <motion.article
      whileHover={interactive ? { y: -6, scale: 1.01 } : undefined}
      transition={{ duration: 0.25, ease: "easeOut" }}
      data-cursor={interactive ? "interactive" : undefined}
      className={cn(
        "group relative overflow-hidden border p-5 backdrop-blur-2xl sm:p-6",
        variantMap[variant],
        interactive ? "will-change-transform" : "",
        className,
      )}
      style={{
        clipPath: "var(--clip-notch)",
        borderTop: "2px solid var(--page-accent)",
      }}
      {...props}
    >
      {/* Notch corner accent triangle */}
      <span
        className="pointer-events-none absolute top-0 right-0 z-[2]"
        style={{
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: "0 20px 20px 0",
          borderColor: "transparent var(--page-accent) transparent transparent",
        }}
      />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <span className="pointer-events-none absolute right-[-3rem] top-[-3rem] h-32 w-32 rounded-full bg-primary/18 blur-3xl transition duration-300 group-hover:scale-125" />

      {eyebrow ? (
        <p className="relative z-[1] font-mono text-[11px] uppercase tracking-[0.32em] text-primary/80">
          {eyebrow}
        </p>
      ) : null}

      {title ? (
        <h3 className="relative z-[1] mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-white">
          {title}
        </h3>
      ) : null}

      {description ? (
        <p className="relative z-[1] mt-3 text-sm leading-7 text-text-muted">
          {description}
        </p>
      ) : null}

      <div className="relative z-[1] mt-5">{children}</div>

      {footer ? <div className="relative z-[1] mt-5">{footer}</div> : null}
    </motion.article>
  );
}
