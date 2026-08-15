"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { FilterSelect } from "@/components/app/filter-select";
import { MixedText } from "@/components/app/mixed-text";
import { sortClassRows, type ClassRow, type ClassSort } from "@/lib/teacher/class-progress";
import type { PaceStatus } from "@/lib/hifz/pace";
import { cn } from "@/lib/utils";

const SORTS: { value: ClassSort; label: string; announce: string }[] = [
  { value: "attention", label: "Needs attention", announce: "furthest behind target first" },
  { value: "name", label: "Name A–Z", announce: "by name" },
  { value: "lowest-hw", label: "Lowest homework", announce: "lowest homework average first" },
];

/** Same words as /teacher/hifz. One status, one vocabulary. */
const PACE_LABEL = { ok: "ahead", warn: "on pace", danger: "behind" } as const;

const PACE_TINT: Record<PaceStatus, string> = {
  ok: "bg-ok/12 text-ok",
  warn: "bg-warn/12 text-warn",
  danger: "bg-danger/12 text-danger",
};

/** The same status again as a hairline down the row's leading edge, so the
 *  shape of the class is readable as a column of colour before a single
 *  number is. Decorative only — the badge carries the meaning. */
const PACE_EDGE: Record<PaceStatus, string> = {
  ok: "bg-ok/60",
  warn: "bg-warn/60",
  danger: "bg-danger/60",
};

/**
 * The column geometry, declared once. The header and every row apply the same
 * string, so the two cannot drift apart the first time a width is touched.
 * Two columns on a phone — the pair of averages sit side by side, the name and
 * the surah span both — and four from `lg`.
 */
const COLS = cn(
  "grid-cols-2 items-center gap-x-5 gap-y-3.5",
  "lg:grid-cols-[minmax(0,1.3fr)_8rem_8rem_minmax(0,1.2fr)] lg:gap-x-6 lg:gap-y-0",
);

/** Two initials, for the identity dot. Falls back rather than throwing on a
 *  single-word or empty name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * One percentage, read at a glance and again in the bar beneath it.
 *
 * A missing figure renders a dash over an empty track, never a zero-width bar
 * at 0% — "nobody has marked this yet" and "they scored nothing" are different
 * facts and must not look the same.
 */
function Metric({
  label,
  pct,
  bar,
}: {
  label: string;
  pct: number | null;
  /** Fill colour. The two metrics keep distinct tones so a row reads as two
   *  quantities rather than one repeated. */
  bar: string;
}) {
  const empty = pct === null || !Number.isFinite(pct);
  return (
    <div>
      {/* On `lg` the header row above names the columns; repeating it on every
          row would be twenty labels for four facts. */}
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground lg:hidden">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-heading text-lg leading-none tabular-nums lg:mt-0",
          empty && "text-muted-foreground/50",
        )}
      >
        {empty ? "—" : `${pct.toFixed(1)}%`}
      </div>
      <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
        {!empty && (
          <div
            className={cn("h-full rounded-full transition-[width] duration-700 ease-out", bar)}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The class, student by student, on the teacher dashboard.
 *
 * Four facts per student and nothing else: the term's homework average, how
 * much of the year's hifz target is signed off, the surah they are on now, and
 * where the teaching calendar says they should be. Everything else a teacher
 * might want is one tap away on the student's own page, which is what the
 * whole row links to.
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
      <p className="empty">
        No students in this class yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <FilterSelect
          label="Sort"
          value={sort}
          options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(v) => setSort(v as ClassSort)}
          controls={uid}
        />
      </div>

      {/* Reordering is silent to a screen reader, and this is always mounted so
          the change is announced rather than merely appearing. */}
      <p className="sr-only" aria-live="polite">
        Class list sorted {announce}.
      </p>

      <div className="overflow-hidden">
        <div
          className={cn(
            COLS,
            "hidden border-b border-line px-4 py-2.5 lg:grid lg:px-5",
            "text-[10px] uppercase tracking-wider text-muted-foreground",
          )}
        >
          <span>Student</span>
          <span>Homework · T{termId}</span>
          <span>Hifdh</span>
          <span>Currently on</span>
        </div>

        <ul id={uid} className="divide-y divide-line">
          {sorted.map((r) => (
            <li key={r.studentId} className="relative">
              {r.pace && (
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 w-[3px]", PACE_EDGE[r.pace])}
                />
              )}
              <Link
                href={`/teacher/hifz/${r.studentId}`}
                className={cn(
                  COLS,
                  "grid px-4 py-3.5 transition-colors hover:bg-muted/50 lg:px-5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                )}
              >
                <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full",
                      "bg-foreground/10 text-[11px] font-semibold tracking-wide text-ink-2",
                    )}
                  >
                    {initials(r.name)}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
                </span>

                <Metric label="Homework" pct={r.hwAvg} bar="bg-viz-hw" />
                <Metric label="Hifdh" pct={r.hifzAvg} bar="bg-viz-exam" />

                <span className="col-span-2 flex items-end justify-between gap-3 lg:col-span-1">
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wider text-muted-foreground lg:hidden">
                      Currently on
                    </span>
                    {r.surah ? (
                      <>
                        <span className="mt-0.5 flex min-w-0 items-baseline gap-2 lg:mt-0">
                          <span className="truncate text-sm font-medium">{r.surah.nameEn}</span>
                          <MixedText
                            text={r.surah.nameAr}
                            className="shrink-0 text-sm text-muted-foreground"
                          />
                        </span>
                        <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                          {r.surah.index} of {r.outOf}
                        </span>
                      </>
                    ) : (
                      // No surah left in the run is the good ending, not a gap —
                      // it must not render as the same dash as missing data.
                      <span className="block text-sm text-muted-foreground/60">
                        {r.pace ? <span className="text-ok">Target complete</span> : "—"}
                      </span>
                    )}
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                        r.pace === null ? "bg-muted text-muted-foreground" : PACE_TINT[r.pace],
                      )}
                    >
                      {r.pace === null ? "no target" : PACE_LABEL[r.pace]}
                    </span>
                    {r.expectedIndex !== null && (
                      <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                        should be on {r.expectedIndex}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted-foreground lg:px-5">
          {/* The em dash is written as an expression: a JSXText run that spans
              lines loses the space it opens with, which closed the gap after
              the term number. */}
          Homework average is for Term {termId}
          {" — "}unsubmitted homework is excluded from it, not counted as zero. Hifz is the share
          of the year&rsquo;s target signed off; the surah numbers are places in the 43, and
          &ldquo;should be on&rdquo; is where the teaching calendar puts a student today.
        </p>
      </div>
    </div>
  );
}
