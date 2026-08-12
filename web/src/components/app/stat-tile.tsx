import { cn } from "@/lib/utils";

export function StatTile({
  label, value, sub, className,
}: {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("glass rounded-2xl px-4 py-3.5", className)}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-1 font-heading text-2xl tabular-nums",
        empty && "text-muted-foreground/50",
      )}>
        {empty ? "—" : value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{empty ? "no data yet" : sub}</div>}
    </div>
  );
}
