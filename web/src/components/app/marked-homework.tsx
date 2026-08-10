"use client";

import { useId, useMemo, useState } from "react";
import { HomeworkRow } from "@/components/app/homework-row";
import { sortHomework, type HomeworkSort, type ScoredHomework } from "@/lib/homework/sort";
import { cn } from "@/lib/utils";

const SORTS: { value: HomeworkSort; label: string; announce: string }[] = [
  { value: "latest", label: "Latest", announce: "most recent first" },
  { value: "oldest", label: "Oldest", announce: "oldest first" },
  { value: "highest", label: "Highest", announce: "highest score first" },
  { value: "lowest", label: "Lowest", announce: "lowest score first" },
];

/**
 * Marked homework, sorted by date or by score.
 *
 * Every mark is already on the page, so this reorders in the browser — no
 * round trip, and no URL state to keep in step with a server render. The term
 * grouping survives every ordering; see lib/homework/sort for why.
 */
export function MarkedHomework({ rows }: { rows: ScoredHomework[] }) {
  const [sort, setSort] = useState<HomeworkSort>("latest");
  const uid = useId();

  const terms = useMemo(() => sortHomework(rows, sort), [rows, sort]);
  const announce = SORTS.find((s) => s.value === sort)!.announce;

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Sort marked homework</legend>
        <span aria-hidden className="mr-0.5 text-xs text-muted-foreground">
          Sort
        </span>
        {SORTS.map((s) => (
          // `relative` anchors the visually-hidden radio to its own chip, so
          // focusing it by keyboard scrolls here and not to the page origin.
          <label key={s.value} className="relative cursor-pointer">
            <input
              type="radio"
              name={`${uid}-sort`}
              value={s.value}
              checked={sort === s.value}
              onChange={() => setSort(s.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "block rounded-md border px-2.5 py-1 text-xs transition-colors",
                "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                sort === s.value
                  ? "border-ink bg-ink font-medium text-primary-foreground"
                  : "border-line text-muted-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </span>
          </label>
        ))}
      </fieldset>

      {/* Reordering is silent to a screen reader, and this is always mounted so
          the change is announced rather than merely appearing. */}
      <p className="sr-only" aria-live="polite">
        Marked homework sorted {announce}, within each term.
      </p>

      <div className="space-y-4">
        {terms.map((term) => (
          <div key={term.termId} className="space-y-1.5">
            <h3 className="text-xs text-muted-foreground">
              Term {term.termId}{" "}
              <span className="tabular-nums text-muted-foreground/60">· {term.rows.length}</span>
            </h3>
            <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
              {term.rows.map((r) => (
                <HomeworkRow
                  key={r.entry.homework.id}
                  entry={r.entry}
                  pct={r.pct ?? undefined}
                  from="progress"
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
