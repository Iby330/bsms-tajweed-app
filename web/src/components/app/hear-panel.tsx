"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReviewLogger } from "./review-logger";
import type { MushafPage } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import type { StartedHearing } from "@/lib/hifz/hearing-actions";
import type { SurahNames } from "./mushaf-reader";

export type PanelStudent = { id: string; name: string; hasTarget: boolean };

/** The next student down the roster who has something to hear, if any. */
export function nextStudent(roster: readonly PanelStudent[], studentId: string): PanelStudent | null {
  const idx = roster.findIndex((s) => s.id === studentId);
  return roster.slice(idx + 1).find((s) => s.hasTarget) ?? null;
}

/**
 * The hearing on a student's Hear tab: the logger in hearing mode, and,
 * once a hearing is confirmed, what was heard and who is next. Start moves
 * the page to the From surah's first page; Confirm pushes `?done=<id>` so
 * the page can describe what was just heard.
 */
export function HearPanel({
  roster, studentId, studentName, loggerKey, sessionId, initialMistakes,
  pages, heat, history, surahNames, pager, hearing, firstPages, start, done,
}: {
  roster: PanelStudent[];
  studentId: string;
  studentName: string;
  /** Changes with the open draft, or with the last hearing when none is open. */
  loggerKey: string;
  sessionId: string | null;
  initialMistakes: MistakeRow[];
  pages: MushafPage[];
  heat: Record<string, string>;
  history: Record<string, WordHistoryEntry[]>;
  surahNames: SurahNames;
  pager: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
  hearing: {
    from: number;
    plannedTo?: number;
    minEnd: number;
    run: { number: number; name: string }[];
    passedBefore: Record<number, string>;
  };
  firstPages: Record<number, number>;   // surah → its first mushaf page
  /** startHearing bound to this student. */
  start: (from: number, to: number) => Promise<StartedHearing>;
  done: { text: string } | null;         // the line after a confirmed hearing
}) {
  const router = useRouter();
  const next = done ? nextStudent(roster, studentId) : null;
  const tab = `/teacher/hifdh/${studentId}?tab=hear`;

  return (
    <div className="space-y-3">
      {done && (
        <div className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
          <span>{done.text}</span>
          {next && (
            <Link href={`/teacher/hifdh/${next.id}?tab=hear`} className="underline">
              Next student · {next.name} →
            </Link>
          )}
        </div>
      )}

      {/* Remount on a new draft, or after a Confirm (the key then names the
          hearing just done): sid, range and marks must never survive onto
          another hearing. The pager's `p` is deliberately NOT in the key:
          turning a page must not remount the logger, since marks span
          pages. */}
      <ReviewLogger
        key={loggerKey}
        mode="hearing"
        sessionId={sessionId}
        initialMistakes={initialMistakes}
        reciterName={studentName}
        pages={pages}
        heat={heat}
        history={history}
        surahNames={surahNames}
        pager={pager}
        hearing={{
          ...hearing,
          names: surahNames,
          start: (r) => start(r.from, r.to),
          onStarted: (h) => {
            const page = firstPages[h.from];
            router.push(page ? `${tab}&p=${page}` : tab, { scroll: false });
          },
          onFinished: (id) => router.push(`${tab}&done=${id}`),
        }}
      />
    </div>
  );
}
