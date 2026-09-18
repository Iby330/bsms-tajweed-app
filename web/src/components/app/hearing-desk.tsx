"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilterSelect } from "./filter-select";
import { ReviewLogger, type SessionProps } from "./review-logger";
import type { MushafPage } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import type { SurahNames } from "./mushaf-reader";

export type DeskStudent = { id: string; name: string; nextSurah: number | null; nextName: string | null };

/**
 * The hearing desk: the chrome around the logger — who is reciting, where
 * they start, and — once a hearing is confirmed — what was heard and who is
 * next — plus the logger itself, in hearing mode. Student and start live in
 * the URL, so a reload lands back on the same student; Confirm pushes
 * `?done=<id>` so the page can describe what was just heard.
 */
export function HearingDesk({
  roster, studentId, from, draftStarted, run, done,
  session, reciterName, pages, heat, history, surahNames, pager, hearing,
}: {
  roster: DeskStudent[];
  studentId: string;
  from: number;
  draftStarted: boolean;                       // marks exist: the start is fixed
  run: { number: number; name_en: string }[];   // the student's run, for the start picker
  done: { text: string } | null;               // the line after a confirmed hearing
  session: SessionProps & { initialMistakes: MistakeRow[] };
  reciterName: string;
  pages: MushafPage[];
  heat: Record<string, string>;
  history: Record<string, WordHistoryEntry[]>;
  surahNames: SurahNames;
  pager: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
  hearing: { from: number; minEnd: number; passedBefore: Record<number, string>; endFromPage?: boolean };
}) {
  const router = useRouter();
  const idx = roster.findIndex((s) => s.id === studentId);
  const next = roster.slice(idx + 1).find((s) => s.nextSurah !== null) ?? null;

  return (
    <div className="space-y-3">
      <div className="glass flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5">
        <FilterSelect
          label="Student"
          value={studentId}
          onChange={(v) => router.push(`/teacher/hifdh/hear?student=${v}`)}
          options={roster.map((s) => ({
            value: s.id,
            label: `${s.name}${s.nextName ? ` · ${s.nextName}` : " · no target set"}`,
            disabled: s.nextSurah === null,
          }))}
        />
        <FilterSelect
          label="Starting at"
          value={String(from)}
          onChange={(v) => router.push(`/teacher/hifdh/hear?student=${studentId}&from=${v}`)}
          options={run.map((s) => ({ value: String(s.number), label: s.name_en }))}
          disabled={draftStarted}
          title={draftStarted ? "The start is fixed once a mark is logged" : undefined}
        />
      </div>

      {draftStarted && (
        <p className="text-xs text-muted-foreground">
          Hearing in progress — switching student keeps it for later.
        </p>
      )}

      {done && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
          <span>{done.text}</span>
          {next && (
            <Link href={`/teacher/hifdh/hear?student=${next.id}`} className="underline">
              Next student · {next.name} →
            </Link>
          )}
        </div>
      )}

      {/* Remount on a change of student or start: sid/marks (session id, the
          mistake set) and the finish popup's end must never survive onto a
          different student's or a different start's draft. The pager's `p`
          is deliberately NOT in this key — turning a page must not remount
          the logger, since marks span pages. */}
      <ReviewLogger
        key={`${studentId}:${from}`}
        mode="hearing"
        {...session}
        reciterName={reciterName}
        pages={pages}
        heat={heat}
        history={history}
        surahNames={surahNames}
        pager={pager}
        hearing={{
          ...hearing,
          names: surahNames,
          onFinished: (id) => router.push(`/teacher/hifdh/hear?student=${studentId}&done=${id}`),
        }}
      />
    </div>
  );
}
