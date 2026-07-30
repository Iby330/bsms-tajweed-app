import { cn } from "@/lib/utils";
import { markTone, fmtMarks } from "@/lib/homework/logic";

export function MarkBadge({ marks, points }: { marks: number | null; points: number }) {
  if (marks === null) {
    return (
      <span className="inline-flex items-center rounded-md border border-line px-2 py-0.5 text-xs text-muted-foreground">
        awaiting mark
      </span>
    );
  }
  const tone = markTone(marks, points);
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
      tone === "ok" && "bg-ok/12 text-ok",
      tone === "warn" && "bg-warn/12 text-warn",
      tone === "danger" && "bg-danger/12 text-danger",
    )}>
      <span aria-hidden>{tone === "ok" ? "✓" : tone === "danger" ? "✗" : "±"}</span>
      {fmtMarks(marks)}/{fmtMarks(points)}
    </span>
  );
}
