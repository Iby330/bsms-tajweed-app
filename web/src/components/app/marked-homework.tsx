"use client";

import { useId, useMemo, useState } from "react";
import { HomeworkRow } from "@/components/app/homework-row";
import { FilterSelect } from "@/components/app/filter-select";
import { sortHomework, type HomeworkSort, type ScoredHomework } from "@/lib/homework/sort";

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
      <FilterSelect
        label="Sort"
        value={sort}
        options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
        onChange={(v) => setSort(v as HomeworkSort)}
        controls={uid}
      />

      {/* Reordering is silent to a screen reader, and this is always mounted so
          the change is announced rather than merely appearing. */}
      <p className="sr-only" aria-live="polite">
        Marked homework sorted {announce}, within each term.
      </p>

      <div id={uid} className="space-y-4">
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
