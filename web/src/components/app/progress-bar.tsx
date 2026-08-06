import { cn } from "@/lib/utils";

/** A done/total bar. Zero total renders an empty track rather than dividing
 *  by zero — an empty course is a real state (a term with nothing released). */
export function ProgressBar({
  done,
  total,
  className,
  label,
  emptyNote = "Nothing to do yet",
}: {
  done: number;
  total: number;
  className?: string;
  label?: string;
  /** Shown when there is nothing actionable — not the same as "0 done". */
  emptyNote?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done >= total;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label ?? `${done} of ${total} complete`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            complete ? "bg-ok" : "bg-ink-2",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {total === 0 ? emptyNote : `${done} of ${total} complete`}
      </p>
    </div>
  );
}
