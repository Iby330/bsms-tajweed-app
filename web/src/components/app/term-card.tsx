import Link from "next/link";
import { ProgressBar } from "@/components/app/progress-bar";
import { seriesShort } from "@/lib/lessons/series";
import type { Term } from "@/lib/curriculum/tree";
import { cn } from "@/lib/utils";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * One term on the course index. A term with nothing unlocked yet is still
 * shown and still clickable — hiding it would read as "the year is empty".
 */
export function TermCard({
  term,
  thisWeek,
}: {
  term: Term;
  /** Deep link to the live module, on the current term only. */
  thisWeek?: { href: string; label: string } | null;
}) {
  const empty = term.moduleCount === 0;
  const unlocked = term.courses.reduce((n, c) => n + c.unlockedCount, 0);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card p-5 transition-colors",
        term.isCurrent ? "border-ink/25 shadow-[0_1px_2px_rgba(29,35,57,0.04)]" : "border-line",
      )}
    >
      <Link href={`/courses/${term.id}`} className="group flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg tracking-tight transition-colors group-hover:text-ink-2">
              Term {term.id}
            </h2>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {dmy(term.startsOn)} – {dmy(term.endsOn)} · exam out of {term.examMax}
            </p>
          </div>
          {term.isCurrent && (
            <span className="shrink-0 rounded-md bg-ink/8 px-2 py-0.5 text-[11px] font-medium text-ink-2">
              Current
            </span>
          )}
        </div>

        {!empty && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {term.courses.map((c) => (
              <li
                key={c.series}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-muted-foreground"
              >
                {seriesShort(c.series)}
                <span className="ml-1 tabular-nums text-muted-foreground/70">{c.moduleCount}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <ProgressBar
            done={term.doneCount}
            total={term.actionableCount}
            emptyNote={empty ? "Nothing released yet" : "Waiting on videos"}
            label={`Term ${term.id}: ${term.doneCount} of ${term.actionableCount} modules complete`}
          />
        </div>

        {/* Locked content is invisible to students, so the count above is
            "released so far". Say what the calendar actually knows. */}
        {term.lockedWeeks.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {empty || unlocked === 0
              ? `Opens ${dmy(term.lockedWeeks[0].unlockAt)}`
              : `${term.lockedWeeks.length} more ${
                  term.lockedWeeks.length === 1 ? "week" : "weeks"
                } from ${dmy(term.lockedWeeks[0].unlockAt)}`}
          </p>
        )}
      </Link>

      {thisWeek && (
        <Link
          href={thisWeek.href}
          className="mt-4 inline-flex items-center gap-1 border-t border-line pt-3 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
        >
          {thisWeek.label} <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}
