import Link from "next/link";
import { notFound } from "next/navigation";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { SERIES_LABELS, seriesShort } from "@/lib/lessons/series";
import { LessonPlayer } from "@/components/app/lesson-player";
import { MixedText } from "@/components/app/mixed-text";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

export default async function Lesson({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  // Everything but the watch flag hangs off this lesson's week, so one embed
  // brings back the week, its sibling lessons and its homework together; the
  // watch flag is keyed on the student instead, so it rides alongside.
  const [{ data: lesson }, { data: watch }] = await Promise.all([
    db
      .from("lessons")
      .select(`
        id, title, series, youtube_id, week_id, position,
        weeks(number, term_id, unlock_at, lessons(id, position, series), homeworks(number, series))
      `)
      .eq("id", lessonId)
      .maybeSingle(),
    db
      .from("lesson_watches")
      .select("lesson_id")
      .eq("student_id", profile.id)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
  ]);
  if (!lesson) notFound();

  const week = lesson.weeks;
  // A locked week's lesson is simply not there yet, as far as a student is
  // concerned — no teasing them with a title they can't open.
  if (!week || Date.parse(week.unlock_at) > Date.now()) notFound();

  // Both lists are narrowed to this lesson's SERIES, not just its week. A week
  // can carry two courses at once — Term 3 week 1 has Tajweed 16 and TFP 1 —
  // so a week-only match would pair a lesson with another course's homework.
  const ordered = week.lessons.filter((l) => l.series === lesson.series)
    .sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((l) => l.id === lesson.id);
  const next = index >= 0 ? ordered[index + 1] : undefined;

  // One homework per week per course; anything else is a data error, and the
  // old `.maybeSingle()` showed no link at all rather than guess between them.
  const forSeries = week.homeworks.filter((h) => h.series === lesson.series);
  const homework = forSeries.length === 1 ? forSeries[0] : null;

  return (
    <>
      {/* React hoists these into <head>, so the TLS handshake with YouTube is
          already done by the time the player mounts and asks for the iframe. */}
      <link rel="preconnect" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />

      <header className="masthead">
        <Crumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: `Term ${week.term_id}`, href: `/courses/${week.term_id}` },
            {
              label: seriesShort(lesson.series),
              href: `/courses/${week.term_id}/${lesson.series}`,
            },
            { label: `Week ${week.number}` },
          ]}
        />
        <h1 style={{ marginTop: 16 }}>
          <MixedText text={lesson.title} />
        </h1>
        <div className="meta">
          <span className="label">
            {SERIES_LABELS[lesson.series] ?? lesson.series} · Week {week.number} · Term{" "}
            {week.term_id}
            {ordered.length > 1 && ` · lesson ${index + 1} of ${ordered.length}`}
          </span>
          {watch && <span className="label hi">Watched</span>}
        </div>
      </header>

      <div className="field">
        <div className="box c12">
          {lesson.youtube_id ? (
            <LessonPlayer
              lessonId={lesson.id}
              youtubeId={lesson.youtube_id}
              initiallyWatched={Boolean(watch)}
            />
          ) : (
            <div className="empty">
              The video for this lesson hasn&apos;t been uploaded yet. Your teacher will
              add it, so check back soon.
            </div>
          )}
        </div>

        {(next || homework) && (
          <div className="box c12" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {homework && (
              <Link href={`/homework/${homework.number}?from=video`} className="chip due">
                This week&apos;s homework →
              </Link>
            )}
            {next && (
              <Link href={`/lessons/${next.id}`} className="chip">
                Next lesson →
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="signoff">
        <Link href={`/courses/${week.term_id}/${lesson.series}`} className="lines">
          ← All modules
        </Link>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">Week {week.number}</span>
      </div>
    </>
  );
}
