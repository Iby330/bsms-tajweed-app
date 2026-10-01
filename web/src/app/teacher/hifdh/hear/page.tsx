import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedPageWords, getCachedSurahs, getCachedSurahStartPages } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { pageWithin } from "@/lib/quran/page-within";
import { hearingMistakesFor, hearingsForStudent, openDraftFor } from "@/lib/hifz/hearing-queries";
import { doneLine } from "@/lib/hifz/hearings";
import { startHearing } from "@/lib/hifz/hearing-actions";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { rosterWithNext } from "@/lib/hifz/roster";
import { HearingDesk, NoTargetDesk, type DeskStudent } from "@/components/app/hearing-desk";
import { TeacherHifdhTabs } from "@/components/app/teacher-hifdh-tabs";
import type { SessionProps } from "@/components/app/review-logger";
import type { SurahNames } from "@/components/app/mushaf-reader";
import type { MistakeRow } from "@/lib/hifz/mistakes";

export const dynamic = "force-dynamic";

/** The seeded mushaf runs An-Nas back to Al-Mulk — pages 562–604. */
const LAST_PAGE = 604;

/**
 * The hearing desk: the Thursday lesson from one page. Pick the student,
 * the mushaf opens at the start surah's first page, tap as they recite,
 * turn pages with the same pager as the per-surah pages, Finish once. The
 * URL carries the student, the start (until a draft is open), and the page.
 */
export default async function HearingDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; from?: string; done?: string; p?: string }>;
}) {
  const { student: studentParam, from: fromParam, done: doneParam, p } = await searchParams;
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const [roster, surahs] = await Promise.all([rosterWithNext(), getCachedSurahs()]);
  const deskRoster: DeskStudent[] = roster.map((s) => ({
    id: s.id, name: s.name, nextSurah: s.next?.number ?? null, nextName: s.next?.name_en ?? null,
  }));

  // A named student must be on this teacher's roster; with none named, the
  // first who has something to hear.
  const chosen = studentParam
    ? roster.find((s) => s.id === studentParam)
    : roster.find((s) => s.next !== null);
  if (!chosen) notFound();
  const studentId = chosen.id;
  const run = chosen.run;

  const masthead = (
    <>
      <header className="masthead">
        <h1><span>Hifdh register</span></h1>
        <p>Hear a student: pick them, tap as they recite, finish once.</p>
      </header>
      <div className="mb-6">
        <TeacherHifdhTabs active="hear" />
      </div>
    </>
  );

  // On the roster but no target yet: nothing to hear, so say so rather than 404.
  if (!run.length) {
    return (
      <>
        {masthead}
        <NoTargetDesk roster={deskRoster} studentId={studentId} />
      </>
    );
  }

  const [draft, allHearings, hearingMistakes, { data: records }, startPages] = await Promise.all([
    openDraftFor(profile.id, studentId),
    hearingsForStudent(studentId),
    hearingMistakesFor(studentId),
    db.from("hifz_records").select("surah_number, passed_at").eq("student_id", studentId),
    getCachedSurahStartPages(),
  ]);

  // The start: the open draft's, else ?from when it is on the run, else the
  // next surah — and a student whose run is complete starts at its last.
  const requested = Number(fromParam);
  const from = draft?.from
    ?? (run.some((s) => s.number === requested) ? requested : (chosen.next?.number ?? run[run.length - 1].number));
  const minEnd = run[run.length - 1].number;

  // The pages the desk can turn: from the run's last surah's first page
  // through the end of the seeded mushaf. Without ?p, open on the start
  // surah's own first page rather than the range's minimum.
  const range = { from: startPages[minEnd], to: LAST_PAGE };
  const page = p ? pageWithin(p, range) : (startPages[from] ?? range.from);

  const rows = await getCachedPageWords(page);
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

  // ensureSession rides along with a draft too: after Finish the logger
  // opens the next hearing through it rather than the submitted one.
  const ensureSession = startHearing.bind(null, studentId, from);
  const session: SessionProps & { initialMistakes: MistakeRow[] } = draft
    ? { sessionId: draft.id, ensureSession, initialMistakes: draft.mistakes }
    : { sessionId: null, ensureSession, initialMistakes: [] };

  return (
    <>
      {masthead}
      <HearingDesk
        roster={deskRoster}
        studentId={studentId}
        from={from}
        // The draft's start wins over ?from the moment the row exists, marks
        // or not, so the picker locks then too rather than looking editable.
        draftStarted={Boolean(draft)}
        run={run.map((s) => ({ number: s.number, name_en: s.name_en }))}
        done={done}
        session={session}
        reciterName={chosen.name}
        pages={pages}
        heat={heat}
        history={history}
        surahNames={surahNames}
        pager={{
          page, min: range.from, max: range.to,
          basePath: `/teacher/hifdh/hear?student=${studentId}&from=${from}`, param: "p",
        }}
        hearing={{ from, minEnd, passedBefore, endFromPage: true }}
      />
    </>
  );
}
