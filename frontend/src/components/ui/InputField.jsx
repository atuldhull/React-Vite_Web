import { useId, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

export default function InputField({
  label,
  helper,
  error,
  prefix,
  multiline = false,
  className,
  inputClassName,
  ...props
}) {
  const generatedId = useId();
  const [focused, setFocused] = useState(false);
  const fieldId = props.id || generatedId;
  const Tag = multiline ? "textarea" : "input";
  const statusText = error || helper;

  return (
    <label htmlFor={fieldId} className={cn("block", className)}>
      {label ? (
        <span className="mb-3 block font-mono text-[11px] uppercase tracking-[0.28em] text-text-muted">
          {label}
        </span>
      ) : null}

      <motion.div
        animate={{ y: focused ? -1 : 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn(
          "relative flex items-start gap-3 bg-panel/70 px-4 py-3 transition-all duration-200 ease-in-out",
          error ? "shadow-[0_0_0_1px_rgba(var(--color-danger),0.12)]" : "",
        )}
        style={{
          border: "none",
          borderBottom: focused
            ? "1.5px solid var(--page-accent)"
            : error
              ? "1.5px solid rgba(var(--color-danger), 0.5)"
              : "1.5px solid rgba(var(--color-text-primary), 0.2)",
          borderLeft: "3px solid var(--page-accent)",
          boxShadow: focused ? "0 2px 8px var(--page-glow)" : "none",
        }}
      >

        {prefix ? (
          <span className="pt-1 font-mono text-xs uppercase tracking-[0.22em] text-primary/80">
            {prefix}
          </span>
        ) : null}

        <Tag
          id={fieldId}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={cn(
            "min-h-[1.5rem] w-full resize-none bg-transparent text-sm leading-7 text-white outline-none placeholder:text-text-dim",
            multiline ? "min-h-[7rem]" : "",
            inputClassName,
          )}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </motion.div>

      {statusText ? (
        <p
          className={cn(
            "mt-3 text-sm leading-6",
            error ? "text-danger" : "text-text-dim",
          )}
        >
          {statusText}
        </p>
      ) : null}
    </label>
  );
}
