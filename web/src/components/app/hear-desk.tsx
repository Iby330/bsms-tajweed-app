"use client";

import { useRouter } from "next/navigation";
import { FilterSelect } from "./filter-select";
import { ReviewLogger } from "./review-logger";
import type { MushafPage } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import type { SurahNames } from "./mushaf-reader";

export type DeskStudent = {
  id: string;
  name: string;
  /** English name of their next surah; null with no target or a completed run. */
  next: string | null;
  hasTarget: boolean;
};

/**
 * The hearing on the register's Hear tab: pick the student being heard,
 * then tap the words they get wrong on the one-page mushaf. Each Save is
 * logged at once for that student. Choosing another student moves the
 * page to them; the logger is keyed by the student, so marks and the
 * count never carry over from one student to the next.
 */
export function HearDesk({
  roster, studentId, studentName, initialMistakes, pages, heat, history, surahNames, pager,
}: {
  roster: DeskStudent[];
  studentId: string;
  studentName: string;
  /** Today's marks by this teacher on this student. */
  initialMistakes: MistakeRow[];
  pages: MushafPage[];
  heat: Record<string, string>;
  history: Record<string, WordHistoryEntry[]>;
  surahNames: SurahNames;
  pager?: { page: number; min: number; max: number; basePath: string; param?: string; step?: number };
}) {
  const router = useRouter();
  const hasTarget = roster.find((s) => s.id === studentId)?.hasTarget ?? false;
  return (
    <div className="space-y-3">
      <FilterSelect
        label="Student"
        value={studentId}
        onChange={(id) => router.push(`/teacher/hifdh?tab=hear&student=${encodeURIComponent(id)}`)}
        options={roster.map((s) => ({
          value: s.id,
          label: `${s.name} · ${s.hasTarget ? (s.next ?? "run complete") : "no target set"}`,
          disabled: !s.hasTarget,
        }))}
      />
      {!hasTarget ? (
        <p className="note">No target set for this student yet.</p>
      ) : (
      <ReviewLogger
        key={studentId}
        mode="hearing"
        sessionId={null}
        studentId={studentId}
        reciterName={studentName}
        pages={pages}
        initialMistakes={initialMistakes}
        heat={heat}
        history={history}
        surahNames={surahNames}
        pager={pager}
      />
      )}
    </div>
  );
}
