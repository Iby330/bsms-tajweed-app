import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahPageRange, getCachedSurahs } from "@/lib/reference/cached";
import { LAST_PAGE, surahPage } from "@/lib/quran/page-within";
import { firstReadablePage } from "@/lib/hifz/mushaf-reach";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { hearingMistakesFor, hearingsFor, hearingsForStudent } from "@/lib/hifz/hearing-queries";
import { latestResult, recordLine, summaryOf, surahState } from "@/lib/hifz/hearings";
import { teacherClass } from "@/lib/teacher/scope";
import { RecordActions } from "@/components/app/record-actions";
import { SurahMushaf } from "@/components/app/surah-mushaf";
import { Rule } from "@/components/app/rule";
import type { SurahNames } from "@/components/app/mushaf-reader";

export const dynamic = "force-dynamic";

/**
 * One surah's record, the same shape the student sees: where it stands,
 * the surah's pages tinted by every hearing mark on it, from results and
 * from marking sessions alike (tap a word for its history), the latest
 * result's note, and the comment and Undo pass on a surah already passed.
 * Nothing is heard here: "Hear from this surah" opens the register's Hear
 * tab on this student at the surah's first page.
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

  const db = await supabaseServer();

  const [mine, me, { data: student }, { data: hp }, surahs, { data: records }, hearings, allHearings, range, pageMistakes] =
    await Promise.all([
      teacherClass(),
      currentProfile(),
      db.from("profiles").select("full_name, class_id, section").eq("id", studentId).maybeSingle(),
      db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
      getCachedSurahs(),
      db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", studentId),
      hearingsFor(studentId, number),
      hearingsForStudent(studentId),
      getCachedSurahPageRange(number),
      // Every mark, not just this surah's (see the student's surah page).
      hearingMistakesFor(studentId),
    ]);
  if (!student) notFound();
  // Same scoping as the student's hifdh page: a teacher with a class of
  // their own sees only their own students. An admin sees every class.
  if (mine && !me?.is_admin && student.class_id !== mine.id) notFound();
  const reach = { from: firstReadablePage(student.section), to: LAST_PAGE };

  const surah = surahs.find((s) => s.number === number);
  if (!surah || !range) notFound();
  // Only surahs on the student's run have a record page.
  const list = hp ? memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]) : [];
  const idx = list.findIndex((s) => s.number === number);
  if (idx === -1) notFound();

  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );
  const record = records?.find((r) => r.surah_number === number) ?? null;
  const passedSet = new Set((records ?? []).map((r) => r.surah_number));
  const state = surahState(number, passedSet, allHearings);
  const latest = latestResult(hearings);
  const line = recordLine(
    state,
    record ? { passedAt: record.passed_at, comment: record.teacher_comment } : null,
    summaryOf(hearings),
  );
  const mistakes = hearings.flatMap((h) => h.mistakes);

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
        <p className="note">
          <Link
            href={`/teacher/hifdh?tab=hear&student=${encodeURIComponent(studentId)}&p=${range.from}`}
            className="underline"
          >
            Hear from this surah
          </Link>
        </p>
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

      <Rule label="The mushaf" />
      <div className="field">
        <section className="box c12" aria-label="The surah, with the marks from its hearings">
          <p className="note">
            {mistakes.length > 0
              ? "Tinted words were marked while hearing. Tap one to see what was said."
              : latest
                ? "No mistakes were marked on this one."
                : "Once this surah is heard, its marks show here."}
          </p>
          <SurahMushaf
            page={surahPage(p, range, reach)}
            range={reach}
            mistakes={pageMistakes}
            basePath={`/teacher/hifdh/${studentId}/${number}`}
            surahNames={surahNames}
          />
        </section>
      </div>
    </>
  );
}
