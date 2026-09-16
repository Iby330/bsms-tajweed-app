"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReviewLogger, type SessionProps } from "./review-logger";
import type { MushafPage } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import type { SurahNames } from "./mushaf-reader";

export type DeskStudent = { id: string; name: string; nextSurah: number | null; nextName: string | null };

/**
 * The desk's chrome around the logger: who is reciting, where they start,
 * and — once a hearing is confirmed — what was heard and who is next. The
 * logger is passed in as children so this shell holds no mushaf state.
 * Student and start live in the URL, so a reload lands back on the same
 * student.
 */
export function HearingDesk({
  roster, studentId, from, draftStarted, run, done, children,
}: {
  roster: DeskStudent[];
  studentId: string;
  from: number;
  draftStarted: boolean;                       // marks exist: the start is fixed
  run: { number: number; name_en: string }[];   // the student's run, for the start picker
  done: { text: string } | null;               // the line after a confirmed hearing
  children: React.ReactNode;
}) {
  const router = useRouter();
  const idx = roster.findIndex((s) => s.id === studentId);
  const next = roster.slice(idx + 1).find((s) => s.nextSurah !== null) ?? null;

  return (
    <div className="space-y-3">
      <div className="glass sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <span className="label">Student</span>
          <select
            aria-label="Student"
            className="rounded-md border border-line bg-background px-2 py-1 text-sm"
            value={studentId}
            onChange={(e) => router.push(`/teacher/hifz/hear?student=${e.target.value}`)}
          >
            {roster.map((s) => (
              <option key={s.id} value={s.id} disabled={s.nextSurah === null}>
                {s.name}{s.nextName ? ` · ${s.nextName}` : " · no target set"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="label">Starting at</span>
          <select
            aria-label="Starting at"
            className="rounded-md border border-line bg-background px-2 py-1 text-sm disabled:opacity-60"
            value={String(from)}
            disabled={draftStarted}
            title={draftStarted ? "The start is fixed once a mark is logged" : undefined}
            onChange={(e) => router.push(`/teacher/hifz/hear?student=${studentId}&from=${e.target.value}`)}
          >
            {run.map((s) => <option key={s.number} value={String(s.number)}>{s.name_en}</option>)}
          </select>
        </div>
      </div>

      {done && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
          <span>{done.text}</span>
          {next && (
            <Link href={`/teacher/hifz/hear?student=${next.id}`} className="underline">
              Next student · {next.name} →
            </Link>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * The logger with the desk's one addition: after Confirm, the URL gains
 * `done=<hearing id>` so the page can say what was heard, and the
 * student's next surah becomes the next start.
 */
export function DeskLogger({
  studentId, session, reciterName, pages, heat, history, surahNames, hearing,
}: {
  studentId: string;
  session: SessionProps & { initialMistakes: MistakeRow[] };
  reciterName: string;
  pages: MushafPage[];
  heat: Record<string, string>;
  history: Record<string, WordHistoryEntry[]>;
  surahNames: SurahNames;
  hearing: { from: number; minEnd: number; passedBefore: Record<number, string>; startPage?: number };
}) {
  const router = useRouter();
  return (
    <ReviewLogger
      mode="hearing"
      {...session}
      reciterName={reciterName}
      pages={pages}
      heat={heat}
      history={history}
      surahNames={surahNames}
      hearing={{
        ...hearing,
        names: surahNames,
        onFinished: (id) => router.push(`/teacher/hifz/hear?student=${studentId}&done=${id}`),
      }}
    />
  );
}
