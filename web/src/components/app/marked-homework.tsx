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
    <div className="flex flex-col gap-3">
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

      <div id={uid} className="flex flex-col gap-6">
        {terms.map((term) => (
          <div key={term.termId}>
            {/* No nested panel: this list already sits inside one, and a card
                within a card reads as a seam rather than a grouping. */}
            <h3 className="label">
              Term {term.termId} <span className="tabular-nums">· {term.rows.length}</span>
            </h3>
            <ul className="rowlist" style={{ marginTop: 8 }}>
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
