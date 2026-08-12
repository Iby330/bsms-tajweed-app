import { cn } from "@/lib/utils";

/** done = handed in · overdue = past its deadline, still not in · pending = still has time */
export type Segment = "done" | "overdue" | "pending";

const FILL: Record<Segment, string> = {
  done: "bg-ok",
  overdue: "bg-danger",
  pending: "bg-foreground/12",
};

/**
 * One segment per homework released so far.
 *
 * "7 of 9" says how many; this says *which* — three in a row missed reads
 * differently from three missed across a term, and the count cannot show that.
 */
export function SegmentedCapsule({
  segments,
  className,
}: {
  segments: Segment[];
  className?: string;
}) {
  if (segments.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing released yet.</p>;
  }
  const done = segments.filter((s) => s === "done").length;

  return (
    <div
      className={cn("flex items-center gap-0.75", className)}
      role="img"
      aria-label={`${done} of ${segments.length} homeworks handed in`}
    >
      {segments.map((s, i) => (
        <span
          key={i}
          data-state={s}
          className={cn("h-3.5 min-w-0 flex-1 rounded-[3px]", FILL[s])}
        />
      ))}
    </div>
  );
}
