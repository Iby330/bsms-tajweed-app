import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedAllPageWords, getCachedSurahs, getCachedSurahStartPages } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { hearingMistakesFor, hearingsForStudent, openDraftFor } from "@/lib/hifz/hearing-queries";
import { doneLine } from "@/lib/hifz/hearings";
import { startHearing } from "@/lib/hifz/hearing-actions";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { rosterWithNext } from "@/lib/hifz/roster";
import { HearingDesk, type DeskStudent } from "@/components/app/hearing-desk";
import { TeacherHifdhTabs } from "@/components/app/teacher-hifdh-tabs";
import type { SessionProps } from "@/components/app/review-logger";
import type { SurahNames } from "@/components/app/mushaf-reader";
import type { MistakeRow } from "@/lib/hifz/mistakes";

export const dynamic = "force-dynamic";

/**
 * The hearing desk: the Thursday lesson from one page. Pick the student,
 * the whole mushaf opens at their next surah, tap as they recite, Finish
 * once. The URL carries the student and, until the first mark, the start.
 */
export default async function HearingDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; from?: string; done?: string }>;
}) {
  const { student: studentParam, from: fromParam, done: doneParam } = await searchParams;
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const [roster, surahs] = await Promise.all([rosterWithNext(), getCachedSurahs()]);
  const deskRoster: DeskStudent[] = roster.map((s) => ({
    id: s.id, name: s.name, nextSurah: s.next?.number ?? null, nextName: s.next?.name_en ?? null,
  }));

  const chosen = roster.find((s) => s.id === studentParam) ?? roster.find((s) => s.next !== null);
  if (!chosen) notFound();
  const studentId = chosen.id;
  const run = chosen.run;
  if (!run.length) notFound();

  const [draft, allHearings, hearingMistakes, { data: records }, rows, startPages] = await Promise.all([
    openDraftFor(profile.id, studentId),
    hearingsForStudent(studentId),
    hearingMistakesFor(studentId),
    db.from("hifz_records").select("surah_number, passed_at").eq("student_id", studentId),
    getCachedAllPageWords(),
    getCachedSurahStartPages(),
  ]);

  // The start: the open draft's, else ?from when it is on the run, else the
  // next surah — and a student whose run is complete starts at its last.
  const requested = Number(fromParam);
  const from = draft?.from
    ?? (run.some((s) => s.number === requested) ? requested : (chosen.next?.number ?? run[run.length - 1].number));
  const minEnd = run[run.length - 1].number;

  const words = rows.map(fromRow);
  const pages = groupIntoPages(words);
  const { heat, history } = spreadHeat(words, hearingMistakes, new Date());
  const surahNames: SurahNames = Object.fromEntries(surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));
  const passedBefore: Record<number, string> = Object.fromEntries((records ?? []).map((r) => [r.surah_number, r.passed_at]));

  // The line after Confirm: the hearing named in ?done, described from what it wrote.
  const justDone = doneParam ? allHearings.find((h) => h.id === doneParam) : undefined;
  const done = justDone
    ? { text: doneLine(justDone.from, justDone.to, new Set(Object.keys(passedBefore).map(Number)), surahNames) }
    : null;

  const session: SessionProps & { initialMistakes: MistakeRow[] } = draft
    ? { sessionId: draft.id, initialMistakes: draft.mistakes }
    : { sessionId: null, ensureSession: startHearing.bind(null, studentId, from), initialMistakes: [] };

  return (
    <>
      <header className="masthead">
        <h1><span>Hifdh register</span></h1>
        <p>Hear a student: pick them, tap as they recite, finish once.</p>
      </header>
      <div className="mb-6">
        <TeacherHifdhTabs active="hear" />
      </div>
      <HearingDesk
        roster={deskRoster}
        studentId={studentId}
        from={from}
        draftStarted={Boolean(draft && draft.mistakes.length)}
        run={run.map((s) => ({ number: s.number, name_en: s.name_en }))}
        done={done}
        session={session}
        reciterName={chosen.name}
        pages={pages}
        heat={heat}
        history={history}
        surahNames={surahNames}
        hearing={{ from, minEnd, passedBefore, startPage: startPages[from] }}
      />
    </>
  );
}
