import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  getCachedPageWords, getCachedSurahPageRange, getCachedSurahs,
} from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { pageWithin } from "@/lib/quran/page-within";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { hearingsFor, hearingsForStudent, openDraftFor } from "@/lib/hifz/hearing-queries";
import { startHearing } from "@/lib/hifz/hearing-actions";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import { recordLine, summaryOf, surahState } from "@/lib/hifz/hearings";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import { teacherClass } from "@/lib/teacher/scope";
import { ReviewLogger, type SessionProps } from "@/components/app/review-logger";
import { RecordActions } from "@/components/app/record-actions";
import { Rule } from "@/components/app/rule";
import type { SurahNames } from "@/components/app/mushaf-reader";

export const dynamic = "force-dynamic";

/**
 * One surah, ready to be heard.
 *
 * This page IS the Thursday lesson: the student presents the surah, the
 * teacher taps each slip on the printed page as it happens, and Finish opens
 * the range popup to sign off. There is no start step — opening the page
 * creates nothing; the first tap or Finish does (see startHearing).
 * Words earlier hearings marked sit tinted underneath, so a slip that keeps
 * coming back is visible while it is being heard again.
 */
export default async function TeacherSurahPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; surah: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ studentId, surah: raw }, { p }] = await Promise.all([params, searchParams]);
  const number = Number(raw);
  if (!Number.isInteger(number) || !SURAH_META[number]) notFound();

  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const [mine, { data: student }, { data: hp }, surahs, { data: records }, hearings, allHearings, draft, range] =
    await Promise.all([
      teacherClass(),
      db.from("profiles").select("full_name, class_id").eq("id", studentId).maybeSingle(),
      db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
      getCachedSurahs(),
      db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", studentId),
      hearingsFor(studentId, number),
      hearingsForStudent(studentId),
      openDraftFor(profile.id, studentId),
      getCachedSurahPageRange(number),
    ]);
  if (!student) notFound();
  // Same scoping as the student's hifdh page: a teacher with a class of
  // their own sees only their own students.
  if (mine && student.class_id !== mine.id) notFound();

  const surah = surahs.find((s) => s.number === number);
  if (!surah || !range) notFound();
  // Only surahs on the student's run have a page — nothing else can be heard.
  const list = hp ? memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]) : [];
  const idx = list.findIndex((s) => s.number === number);
  if (idx === -1) notFound();

  const page = pageWithin(p, range);
  const rows = await getCachedPageWords(page);
  const words = rows.map(fromRow);
  const { heat, history } = spreadHeat(words, hearings.flatMap((h) => h.mistakes), new Date());
  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );

  const record = records?.find((r) => r.surah_number === number) ?? null;
  const passedSet = new Set((records ?? []).map((r) => r.surah_number));
  const passedBefore: Record<number, string> = Object.fromEntries(
    (records ?? []).map((r) => [r.surah_number, r.passed_at]),
  );
  const state = surahState(number, passedSet, allHearings);
  const latest = hearings[0] ?? null;
  const line = recordLine(
    state,
    record ? { passedAt: record.passed_at, comment: record.teacher_comment } : null,
    summaryOf(latest),
  );
  const minEnd = list[list.length - 1].number;
  const basePath = `/teacher/hifdh/${studentId}/${number}`;

  // ensureSession rides along with a draft too: after Finish the logger
  // opens the next hearing through it rather than the submitted one.
  const ensureSession = startHearing.bind(null, studentId, number);
  const session: SessionProps & { initialMistakes: MistakeRow[] } = draft && draft.from === number
    ? { sessionId: draft.id, ensureSession, initialMistakes: draft.mistakes }
    : { sessionId: null, ensureSession, initialMistakes: [] as MistakeRow[] };

  return (
    <>
      <header className="masthead">
        <Link href={`/teacher/hifdh/${studentId}`} className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          {student.full_name}
        </Link>
        <h1 style={{ marginTop: 18 }}>
          <span dir="rtl" lang="ar" className="ar-quran surahtitle">{surah.name_ar}</span>
        </h1>
        <p>
          {surah.name_en} · {idx + 1} of {list.length} · {line}
        </p>
        {latest?.note && <p className="note">Last time: &quot;{latest.note}&quot;</p>}
      </header>

      {record && (
        <>
          <Rule label="The record" />
          <div className="field">
            <section className="box c12">
              <RecordActions studentId={studentId} surah={number} comment={record.teacher_comment} />
            </section>
          </div>
        </>
      )}

      <Rule label={latest ? "Hear it again" : "Hear it"} />
      <div className="field">
        {draft && draft.from !== number ? (
          <section className="box c12">
            <p className="note">
              A hearing is in progress from {surahs.find((s) => s.number === draft.from)?.name_en ?? draft.from}.{" "}
              <Link href={`/teacher/hifdh/hear?student=${studentId}`} className="underline">Continue it at the desk</Link>.
            </p>
          </section>
        ) : (
          <section className="box c12" aria-label="The mushaf">
            {/* Keyed on the draft, or on the latest hearing when there is
                none: a Finish refreshes this page in place, and the next
                hearing must start from a fresh logger, not the last one's
                session and marks. */}
            <ReviewLogger
              key={draft?.id ?? `new:${latest?.id ?? "none"}`}
              mode="hearing"
              {...session}
              reciterName={student.full_name}
              pages={groupIntoPages(words)}
              heat={heat}
              history={history}
              surahNames={surahNames}
              pager={{ page, min: range.from, max: range.to, basePath, param: "p" }}
              hearing={{ from: number, minEnd, names: surahNames, passedBefore }}
            />
          </section>
        )}
      </div>
    </>
  );
}
