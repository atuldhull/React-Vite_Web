import { cn } from "@/lib/cn";

/**
 * CoreBadge — the little tier chip worn by every core member.
 *   council → amber  ·  head → pink/secondary  ·  member → violet/primary
 */
const TIERS = {
  council: { label: "Council", cls: "border-warning/40 bg-warning/12 text-warning" },
  head:    { label: "Head",    cls: "border-secondary/40 bg-secondary/12 text-secondary" },
  member:  { label: "Core",    cls: "border-primary/40 bg-primary/12 text-primary" },
};

export default function CoreBadge({ tier = "member", className }) {
  const t = TIERS[tier] || TIERS.member;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em]",
        t.cls,
        className,
      )}
    >
      <span className="h-1 w-1 rounded-full bg-current" />
      {t.label}
    </span>
  );
}
