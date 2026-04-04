import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";
import { useOrgBranding } from "@/components/OrgThemeProvider";

export default function BrandMark({ to = "/", compact = false, className }) {
  const { orgName } = useOrgBranding();

  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-3 text-left",
        compact ? "gap-2.5" : "gap-3.5",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-[1.15rem] border border-line/25 bg-white/[0.04] shadow-panel",
          compact ? "h-11 w-11" : "h-12 w-12",
        )}
        style={{ borderColor: "color-mix(in srgb, var(--org-primary) 25%, transparent)" }}
      >
        <span
          className="absolute inset-[5px] rounded-[0.9rem] opacity-85"
          style={{ background: `linear-gradient(135deg, var(--org-primary), var(--org-secondary))` }}
        />
        <span className="relative font-display text-lg font-bold tracking-[-0.08em] text-white">
          MC
        </span>
      </span>

      <span className="flex flex-col">
        <span className="font-display text-lg font-bold tracking-[-0.06em] text-white">
          Math Collective
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-text-dim">
          {orgName || "BMSIT Chapter"}
        </span>
      </span>
    </Link>
  );
}
