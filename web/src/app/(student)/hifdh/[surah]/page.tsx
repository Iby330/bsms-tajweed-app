import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahs, getCachedSurahPageRange } from "@/lib/reference/cached";
import { memorisationList } from "@/lib/hifz/pace";
import { hizbOf } from "@/lib/hifz/hizb";
import { pageWithin } from "@/lib/quran/page-within";
import { hearingsFor, hearingsForStudent } from "@/lib/hifz/hearing-queries";
import { commentToShow, latestResult, recordLine, summaryOf, surahState } from "@/lib/hifz/hearings";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { SURAH_INFO } from "@/lib/hifz/surah-info";
import { SURAH_SUMMARY, REVIEWED } from "@/lib/hifz/surah-summary";
import { fmtDay, fmtStamp } from "@/lib/format";
import { SurahMushaf } from "@/components/app/surah-mushaf";
import { Rule } from "@/components/app/rule";
import type { SurahNames } from "@/components/app/mushaf-reader";

export const dynamic = "force-dynamic";

/**
 * One surah, in full.
 *
 * A page rather than a dialog: the introductions run to thousands of words,
 * and long reading inside a modal is a bad trade — no back button, no link to
 * send someone, nowhere to scroll to.
 *
 * The student's own record comes FIRST. Whatever the scholarship says, the
 * question they opened this with is "how did I do on this one" — the teacher's
 * comment is the part written for them personally.
 */
export default async function SurahPage({
  params,
  searchParams,
}: {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const [{ surah: raw }, { p }] = await Promise.all([params, searchParams]);
  const number = Number(raw);
  // Checked against static data before touching the database, so a nonsense
  // number costs no query. SURAH_META covers 67–114, which is WIDER than the
  // seeded 72–114: 67–71 pass this check and then fail the lookup below.
  // That is correct either way — both paths end in notFound() — and it means
  // the pages are already written for the day those rows are seeded.
  //
  // This still answers 200, not 404, and that is expected rather than broken:
  // the student layout awaits the profile before this page runs, so the stream
  // is already committed by the time notFound() fires. Per the streaming guide
  // in node_modules/next/dist/docs, Next cannot rewind the status and injects
  // <meta name="robots" content="noindex"> instead — verified present. Every
  // route here sits behind auth, so nothing was going to index it anyway.
  if (!Number.isInteger(number) || !SURAH_META[number]) notFound();

  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const [surahs, hp, rec, hearings, allHearings, range] = await Promise.all([
    getCachedSurahs(),
    db
      .from("hifz_profiles")
      .select("start_surah, target_count")
      .eq("student_id", profile.id)
      .maybeSingle(),
    db
      .from("hifz_records")
      .select("surah_number, passed_at, teacher_comment")
      .eq("student_id", profile.id),
    hearingsFor(profile.id, number),
    hearingsForStudent(profile.id),
    getCachedSurahPageRange(number),
  ]);

  const surah = surahs.find((s) => s.number === number);
  if (!surah) notFound();

  // Position within this student's own run, so "12 of 30" means their list.
  const list = hp.data
    ? memorisationList(hp.data.start_surah, hp.data.target_count, surahs)
    : [];
  const idx = list.findIndex((s) => s.number === number);

  const meta = SURAH_META[number];
  const info = SURAH_INFO[number];
  const summary = SURAH_SUMMARY[number];
  const records = rec.data ?? [];
  const record = records.find((r) => r.surah_number === number) ?? null;
  const passedSet = new Set(records.map((r) => r.surah_number));
  const state = surahState(number, passedSet, allHearings);

  // The latest result carries the date and note, and the marks since the
  // one before it the count; the record carries the truth about "passed".
  // recordLine reconciles the two. Marks show from every hearing session.
  const latest = latestResult(hearings);
  const line = recordLine(
    state,
    record ? { passedAt: record.passed_at, comment: record.teacher_comment } : null,
    summaryOf(hearings),
  );
  const statLabel = state === "passed" ? "Passed" : state === "not_passed" ? "Not passed" : "Not yet";
  const hearingMistakes = hearings.flatMap((h) => h.mistakes);
  // A Not passed note is the latest word until the next hearing passes; a
  // pass comment otherwise. Both render in the same blockquote.
  const comment = commentToShow(
    state,
    record ? { comment: record.teacher_comment, passedAt: record.passed_at } : null,
    latest ? { note: latest.note, submittedAt: latest.submittedAt } : null,
  );
  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );

  return (
    <>
      <header className="masthead">
        {/* Same step-up affordance as the course pages, so going back looks
            the same wherever you are. */}
        <Link href="/hifdh" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Back to your hifdh
        </Link>
        <h1 style={{ marginTop: 18 }}>
          <span dir="rtl" lang="ar" className="ar-quran surahtitle">
            {surah.name_ar}
          </span>
        </h1>
        <p>
          {surah.name_en}
          {meta && `, “${meta.meaning}”`}
        </p>
        <div className="facts" style={{ marginTop: 16 }}>
          {meta && <span>{meta.ayahs} āyāt</span>}
          {info && <span>{info.revealedIn === "makkah" ? "Makkan" : "Madinan"}</span>}
          {info && <span>Revealed {info.revelationOrder}th</span>}
          <span>Hizb {hizbOf(number)}</span>
          {idx >= 0 && <span>{idx + 1} of {list.length} on your list</span>}
        </div>
      </header>

      {/* ── the student's own record, before anybody else's words ── */}
      <div className="divider">
        <span className="label">Your record</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <section className="box c12">
          {record ? (
            <>
              <div className="stat">
                <span className="v sm">{statLabel}</span>
              </div>
              <div className="note">{line}.</div>
              {comment ? (
                <div className="saywrap" style={{ marginTop: 8, paddingTop: 0, borderTop: "none" }}>
                  <div className="seclab">What your teacher said</div>
                  <blockquote className="say">
                    <p>&ldquo;{comment.text}&rdquo;</p>
                    <div className="by">
                      {comment.kind === "hearing" ? fmtStamp(comment.date) : fmtDay(comment.date)}
                    </div>
                  </blockquote>
                </div>
              ) : (
                <div className="note">No comment was left on this one.</div>
              )}
            </>
          ) : (
            <>
              <div className="stat">
                <span className={`v sm${state === "not_passed" ? " text-danger" : ""}`}>{statLabel}</span>
              </div>
              <div className="note">
                {latest
                  ? `${line}.`
                  : idx >= 0
                    ? "This one is still ahead of you. Your teacher hears it when you are ready."
                    : "This surah is not on your list this year."}
              </div>
              {comment && (
                <div className="saywrap" style={{ marginTop: 8, paddingTop: 0, borderTop: "none" }}>
                  <div className="seclab">What your teacher said</div>
                  <blockquote className="say">
                    <p>&ldquo;{comment.text}&rdquo;</p>
                    <div className="by">
                      {comment.kind === "hearing" ? fmtStamp(comment.date) : fmtDay(comment.date)}
                    </div>
                  </blockquote>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ── the surah itself, with the teacher's marks on it ── */}
      {range && idx >= 0 && (
        <>
          <Rule label="The mushaf" />
          <div className="field">
            <section className="box c12" aria-label="The surah, with your teacher's marks">
              <p className="note">
                {hearingMistakes.length > 0
                  ? "Tinted words are the ones your teacher marked. Tap one to see what went wrong."
                  : latest
                    ? "Your teacher marked no mistakes on this one."
                    : "Once your teacher has heard this surah, their marks show here."}
              </p>
              <SurahMushaf
                page={pageWithin(p, range)}
                range={range}
                mistakes={hearingMistakes}
                basePath={`/hifdh/${number}`}
                surahNames={surahNames}
              />
            </section>
          </div>
        </>
      )}

      {/* ── then the surah itself, briefly ── */}
      {summary && (
        <>
          <div className="divider">
            <span className="label">About this surah</span>
            <span className="r" />
            <span className="m" />
          </div>

          <div className="field">
            <article className="box c12 reading">
              {summary.paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {summary.dispute && <p className="dispute">{summary.dispute}</p>}

              {/* summary.reflection is written and kept in the data, but not
                  shown yet. The reflections make claims about how to live
                  rather than about what a surah says, so they wait for a
                  teacher's review before any student reads them. Render this
                  block again once that has happened. */}
              {!REVIEWED && (
                <p className="draftnote">
                  Draft summary. Not yet checked by a teacher.
                </p>
              )}
              <a
                className="readon"
                href={`https://quran.com/${number}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the surah on Quran.com →
              </a>
            </article>
          </div>
        </>
      )}

      <div className="signoff">
        <Link href="/hifdh" className="lines">
          ← Your hifdh
        </Link>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">{surah.name_en}</span>
      </div>
    </>
  );
}
