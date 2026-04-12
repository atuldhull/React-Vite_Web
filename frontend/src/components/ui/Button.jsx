import { motion } from "framer-motion";
import Loader from "@/components/ui/Loader";
import { cn } from "@/lib/cn";

const sizeMap = {
  sm: "h-10 px-4 text-[11px] tracking-[0.24em]",
  md: "h-12 px-5 text-xs tracking-[0.28em]",
  lg: "h-14 px-6 text-sm tracking-[0.26em]",
};

const variantMap = {
  primary: "border-transparent text-black",
  secondary: "border-transparent bg-transparent",
  ghost: "border-transparent bg-white/[0.03] text-text-muted",
  danger: "border-transparent",
};

const variantStyles = {
  primary: {
    clipPath: "var(--clip-hex)",
    background: "var(--page-accent)",
    color: "rgb(var(--color-obsidian))",
    padding: "var(--space-sm) var(--space-xl)",
  },
  secondary: {
    clipPath: "var(--clip-para)",
    background: "transparent",
    border: "1.5px solid var(--page-accent)",
    color: "var(--page-accent)",
  },
  ghost: {
    clipPath: "var(--clip-para)",
  },
  danger: {
    clipPath: "var(--clip-diamond)",
    minWidth: "120px",
    minHeight: "48px",
    background: "rgba(var(--color-danger), 0.15)",
    color: "rgb(var(--color-danger))",
  },
};

export default function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  leading,
  trailing,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type="button"
      whileHover={isDisabled ? undefined : { y: -2, scale: 1.01 }}
      whileTap={isDisabled ? undefined : { scale: 0.985 }}
      data-cursor={isDisabled ? undefined : "interactive"}
      className={cn(
        "group relative inline-flex items-center justify-center overflow-hidden border font-mono uppercase transition-all duration-200 ease-in-out hover:shadow-[0_0_16px_var(--page-glow)]",
        sizeMap[size],
        variantMap[variant],
        isDisabled ? "pointer-events-none opacity-55 saturate-50" : "cursor-pointer",
        className,
      )}
      style={variantStyles[variant] || { clipPath: "var(--clip-para)" }}
      disabled={isDisabled}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_48%)] opacity-80" />
      <span className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -skew-x-[18deg] bg-white/15 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-shimmer" />
      <span className="relative z-[1] inline-flex items-center gap-3">
        {loading ? <Loader variant="ring" size="xs" /> : leading}
        <span>{children}</span>
        {!loading ? trailing : null}
      </span>
    </motion.button>
  );
}
