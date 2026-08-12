"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { FilterSelect } from "@/components/app/filter-select";
import { sortClassRows, type ClassRow, type ClassSort } from "@/lib/teacher/class-progress";
import { cn } from "@/lib/utils";

const SORTS: { value: ClassSort; label: string; announce: string }[] = [
  { value: "attention", label: "Needs attention", announce: "furthest behind target first" },
  { value: "name", label: "Name A–Z", announce: "by name" },
  { value: "lowest-hw", label: "Lowest homework", announce: "lowest homework average first" },
];

/** Same words as /teacher/hifz. One status, one vocabulary. */
const PACE_LABEL = { ok: "ahead", warn: "on pace", danger: "behind" } as const;

/**
 * The class, student by student, on the teacher dashboard.
 *
 * Every row is already on the page, so the sort reorders in the browser — no
 * round trip, and no URL state to keep in step with a server render.
 */
export function ClassProgress({ rows, termId }: { rows: ClassRow[]; termId: number }) {
  const [sort, setSort] = useState<ClassSort>("attention");
  const uid = useId();

  const sorted = useMemo(() => sortClassRows(rows, sort), [rows, sort]);
  const announce = SORTS.find((s) => s.value === sort)!.announce;

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-line bg-card p-6 text-sm text-muted-foreground">
        No students in this class yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FilterSelect
        label="Sort"
        value={sort}
        options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
        onChange={(v) => setSort(v as ClassSort)}
        controls={uid}
      />

      {/* Reordering is silent to a screen reader, and this is always mounted so
          the change is announced rather than merely appearing. */}
      <p className="sr-only" aria-live="polite">
        Class list sorted {announce}.
      </p>

      <ul id={uid} className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {sorted.map((r) => (
          <li key={r.studentId}>
            <Link
              href={`/teacher/hifz/${r.studentId}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.lastPassed ?? "—"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.passed}/{r.target || "—"} · expected {r.expected}
                </span>
                <span className="w-14 text-right text-xs tabular-nums">
                  {r.hwAvg === null ? "—" : `${r.hwAvg.toFixed(1)}%`}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    r.pace === null && "bg-muted text-muted-foreground",
                    r.pace === "ok" && "bg-ok/12 text-ok",
                    r.pace === "warn" && "bg-warn/12 text-warn",
                    r.pace === "danger" && "bg-danger/12 text-danger",
                  )}
                >
                  {r.pace === null ? "no target" : PACE_LABEL[r.pace]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Homework average is for Term {termId}. Unsubmitted homework is excluded from the
        average, not counted as zero.
      </p>
    </div>
  );
}
