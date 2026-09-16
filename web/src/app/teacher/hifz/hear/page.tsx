import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedAllPageWords, getCachedSurahs, getCachedSurahStartPages } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { hearingMistakesFor, hearingsForStudent, openDraftFor } from "@/lib/hifz/hearing-queries";
import { rangeSurahs } from "@/lib/hifz/hearings";
import { startHearing } from "@/lib/hifz/hearing-actions";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { teacherRoster } from "@/lib/teacher/scope";
import { DeskLogger, HearingDesk, type DeskStudent } from "@/components/app/hearing-desk";
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

  const [students, surahs] = await Promise.all([teacherRoster(), getCachedSurahs()]);
  const ids = students.map((s) => s.id);
  const { data: progress } = ids.length
    ? await db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids)
    : { data: [] };
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));

  const all = surahs as Surah[];
  const runOf = (id: string) => {
    const p = byStudent.get(id);
    return p ? memorisationList(Number(p.start_surah ?? 114), Number(p.target_count), all) : [];
  };
  const roster: DeskStudent[] = students.map((s) => {
    const p = byStudent.get(s.id);
    const next = p ? runOf(s.id)[Number(p.passed)] : undefined;
    return { id: s.id, name: s.full_name, nextSurah: next?.number ?? null, nextName: next?.name_en ?? null };
  });

  const chosen = roster.find((s) => s.id === studentParam) ?? roster.find((s) => s.nextSurah !== null);
  if (!chosen) notFound();
  const studentId = chosen.id;
  const run = runOf(studentId);
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
    ?? (run.some((s) => s.number === requested) ? requested : (chosen.nextSurah ?? run[run.length - 1].number));
  const minEnd = run[run.length - 1].number;

  const words = rows.map(fromRow);
  const pages = groupIntoPages(words);
  const { heat, history } = spreadHeat(words, hearingMistakes, new Date());
  const surahNames: SurahNames = Object.fromEntries(surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));
  const passedBefore: Record<number, string> = Object.fromEntries((records ?? []).map((r) => [r.surah_number, r.passed_at]));

  // The line after Confirm: the hearing named in ?done, described from what it wrote.
  const justDone = doneParam ? allHearings.find((h) => h.id === doneParam) : undefined;
  let done: { text: string } | null = null;
  if (justDone) {
    const range = rangeSurahs(justDone.from, justDone.to);
    const passed = range.filter((n) => passedBefore[n] !== undefined).length;
    const name = (n: number) => surahNames[n]?.en ?? String(n);
    const span = range.length === 1 ? name(justDone.from) : `${name(justDone.from)} → ${name(justDone.to)}`;
    done = { text: `Heard ${span} · ${passed} passed · ${range.length - passed} not passed` };
  }

  const session: SessionProps & { initialMistakes: MistakeRow[] } = draft
    ? { sessionId: draft.id, initialMistakes: draft.mistakes }
    : { sessionId: null, ensureSession: startHearing.bind(null, studentId, from), initialMistakes: [] };

  return (
    <>
      <header className="masthead">
        <h1><span>Hear</span></h1>
        <p>The lesson, from one page: pick the student, tap as they recite, finish once.</p>
      </header>
      <HearingDesk
        roster={roster}
        studentId={studentId}
        from={from}
        draftStarted={Boolean(draft && draft.mistakes.length)}
        run={run.map((s) => ({ number: s.number, name_en: s.name_en }))}
        done={done}
      >
        <DeskLogger
          studentId={studentId}
          session={session}
          reciterName={chosen.name}
          pages={pages}
          heat={heat}
          history={history}
          surahNames={surahNames}
          hearing={{ from, minEnd, passedBefore, startPage: startPages[from] }}
        />
      </HearingDesk>
    </>
  );
}
