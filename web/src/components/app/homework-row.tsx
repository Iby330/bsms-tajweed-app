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
      <Link href={`/homework/${h.number}${from ? `?from=${from}` : ""}`} className="tw">
        <span className="t">
          {homeworkLabel(h.number, entry.series)}
          {entry.title && <MixedText text={entry.title} className="ml-2 font-normal opacity-70" />}
        </span>
        <span className="s">
          {seriesShort(entry.series)} · Term {entry.termId}, week {entry.weekNumber}
          {!h.is_graded && " · ungraded"}
        </span>
      </Link>

      <span className="meta">
          {marked && pct !== undefined ? (
            <span
              className={cn(
                "chip tabular-nums",
                pct >= 80 && "ok",
                pct >= 50 && pct < 80 && "warn",
                pct < 50 && "bad",
              )}
            >
              {Math.round(pct)}%
            </span>
          ) : marked ? (
            <span className="chip ok">Marked</span>
          ) : entry.submission === "draft" ? (
            <span className="chip warn">Draft</span>
          ) : null}

          {h.due_at && !entry.submission && <CountdownChip dueAt={h.due_at} />}
          {!entry.unlocked && (
            <span className="s">{h.due_at ? `due ${dmy(h.due_at)}` : "not released"}</span>
          )}
      </span>
    </li>
  );
}
