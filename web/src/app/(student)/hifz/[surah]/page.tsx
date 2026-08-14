import Link from "next/link";
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList } from "@/lib/hifz/pace";
import { hizbOf } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { SURAH_INFO } from "@/lib/hifz/surah-info";
import { SURAH_SUMMARY, REVIEWED } from "@/lib/hifz/surah-summary";
import { fmtDay } from "@/lib/format";

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
}: {
  params: Promise<{ surah: string }>;
}) {
  const { surah: raw } = await params;
  const number = Number(raw);
  // Checked against static data before touching the database — SURAH_META
  // covers 72–114, exactly the seeded range, so an unknown surah costs no
  // query.
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

  const [surahs, hp, rec] = await Promise.all([
    getCachedSurahs(),
    db
      .from("hifz_profiles")
      .select("start_surah, target_count")
      .eq("student_id", profile.id)
      .maybeSingle(),
    db
      .from("hifz_records")
      .select("passed_at, teacher_comment")
      .eq("student_id", profile.id)
      .eq("surah_number", number)
      .maybeSingle(),
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
  const record = rec.data;

  return (
    <>
      <header className="masthead">
        <Link href="/hifz" className="label backlink">
          ← Your hifz
        </Link>
        <h1 style={{ marginTop: 18 }}>
          <span dir="rtl" lang="ar" className="ar-quran surahtitle">
            {surah.name_ar}
          </span>
        </h1>
        <p>
          {surah.name_en}
          {meta && ` — “${meta.meaning}”`}
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
                <span className="v sm">Passed</span>
              </div>
              <div className="note">Heard by your teacher on {fmtDay(record.passed_at)}.</div>
              {record.teacher_comment ? (
                <div className="saywrap" style={{ marginTop: 8, paddingTop: 0, borderTop: "none" }}>
                  <div className="seclab">What your teacher said</div>
                  <blockquote className="say">
                    <p>&ldquo;{record.teacher_comment}&rdquo;</p>
                    <div className="by">{fmtDay(record.passed_at)}</div>
                  </blockquote>
                </div>
              ) : (
                <div className="note">No comment was left on this one.</div>
              )}
            </>
          ) : (
            <>
              <div className="stat">
                <span className="v sm">Not yet</span>
              </div>
              <div className="note">
                {idx >= 0
                  ? "This one is still ahead of you. Your teacher hears it when you are ready."
                  : "This surah is not on your list this year."}
              </div>
            </>
          )}
        </section>
      </div>

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
              <p>{summary.summary}</p>
              {summary.dispute && <p className="dispute">{summary.dispute}</p>}
              {!REVIEWED && (
                <p className="draftnote">
                  Draft summary — not yet checked by a teacher.
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
        <Link href="/hifz" className="lines">
          ← Your hifz
        </Link>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">{surah.name_en}</span>
      </div>
    </>
  );
}
