import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

const sizeMap = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

export default function Loader({
  variant = "orbit",
  size = "md",
  className,
  label,
}) {
  if (variant === "dots") {
    return (
      <div className={cn("inline-flex items-center gap-3", className)}>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((index) => (
            <motion.span
              key={index}
              className="h-2.5 w-2.5 rounded-full bg-secondary"
              animate={{
                opacity: [0.35, 1, 0.35],
                y: [0, -6, 0],
                scale: [0.9, 1.12, 0.9],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.14,
              }}
            />
          ))}
        </div>
        {label ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
            {label}
          </span>
        ) : null}
      </div>
    );
  }

  if (variant === "ring") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block animate-spin rounded-full border-[1.8px]",
          sizeMap[size],
          className,
        )}
        style={{
          borderColor: "var(--color-ring-border)",
          borderTopColor: "currentColor",
        }}
      />
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <span className={cn("relative inline-flex items-center justify-center", sizeMap[size])}>
        <span className="absolute inset-0 rounded-full border border-primary/25" />
        <motion.span
          className="absolute inset-[12%] rounded-full border border-secondary/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="absolute inset-[28%] rounded-full bg-gradient-to-br from-primary via-secondary to-glow shadow-pulse"
          animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
      {label ? (
        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted">
          {label}
        </span>
      ) : null}
    </div>
  );
}
