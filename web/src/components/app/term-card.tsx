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
    <div className={cn("tcard", term.isCurrent && "current")}>
      <Link href={`/courses/${term.id}`} className="flex flex-1 flex-col gap-3">
        <span className="label">
          Term {term.id}
          {term.isCurrent && " · current"}
        </span>
        <h2>
          {dmy(term.startsOn)} to {dmy(term.endsOn)}
        </h2>
        <span className="note">Exam out of {term.examMax}</span>

        {!empty && (
          <ul className="tags">
            {term.courses.map((c) => (
              <li key={c.series}>
                {seriesShort(c.series)} {c.moduleCount}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-1">
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
