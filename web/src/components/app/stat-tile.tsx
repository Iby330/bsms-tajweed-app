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
    <div className={cn("box c4", className)}>
      <span className="label">{label}</span>
      <div className="stat">
        <span className={cn("v sm", empty && "opacity-40")}>{empty ? "\u2014" : value}</span>
      </div>
      {sub && <div className="note">{empty ? "no data yet" : sub}</div>}
    </div>
  );
}
