import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { CountdownChip } from "@/components/app/countdown-chip";
import { seriesShort } from "@/lib/lessons/series";
import type { HomeworkEntry } from "@/lib/curriculum/tree";
import type { HomeworkOrigin } from "@/lib/homework/back-link";
import { cn } from "@/lib/utils";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Homework label. TFP is numbered 101+ in the database so it can share a
 *  unique key with Tajweed — students see it as TFP 1..7. */
export function homeworkLabel(number: number, series: string): string {
  const display = number > 100 ? number - 100 : number;
  return `${series === "tfp" ? "TFP" : "Homework"} ${display}`;
}

/**
 * One row of the homework worklist. Always states its course and week —
 * a bare "Homework 14" tells a student nothing about where it belongs.
 */
export function HomeworkRow({
  entry,
  pct,
  from,
}: {
  entry: HomeworkEntry;
  pct?: number;
  /** Screen this row sits on, so the homework page can offer a "back" link
   *  that retraces the student's actual route. See lib/homework/back-link. */
  from?: HomeworkOrigin;
}) {
  const { homework: h } = entry;
  const marked = entry.submission === "approved";

  return (
    <li>
      <Link
        href={`/homework/${h.number}${from ? `?from=${from}` : ""}`}
        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/60"
      >
        <span className="min-w-0">
          <span className="text-sm font-medium">{homeworkLabel(h.number, entry.series)}</span>
          {entry.title && (
            <MixedText text={entry.title} className="ml-2 text-xs text-muted-foreground" />
          )}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {seriesShort(entry.series)} · Term {entry.termId}, week {entry.weekNumber}
            {!h.is_graded && " · ungraded"}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {marked && pct !== undefined ? (
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                pct >= 80 && "bg-ok/12 text-ok",
                pct >= 50 && pct < 80 && "bg-warn/12 text-warn",
                pct < 50 && "bg-danger/12 text-danger",
              )}
            >
              {Math.round(pct)}%
            </span>
          ) : marked ? (
            <span className="rounded-md bg-ok/12 px-2 py-0.5 text-xs font-medium text-ok">
              Marked
            </span>
          ) : entry.submission === "draft" ? (
            <span className="rounded-md bg-warn/12 px-2 py-0.5 text-xs font-medium text-warn">
              Draft
            </span>
          ) : null}

          {h.due_at && !entry.submission && <CountdownChip dueAt={h.due_at} />}
          {!entry.unlocked && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {h.due_at ? `due ${dmy(h.due_at)}` : "not released"}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
