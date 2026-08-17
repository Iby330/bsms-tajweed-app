import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { blockTopic } from "@/lib/curriculum/catalogue";
import { moduleTitle } from "@/lib/curriculum/tree";
import { SERIES_LABELS } from "@/lib/lessons/series";
import { LessonPlayer } from "@/components/app/lesson-player";
import { LessonVideoInput } from "@/components/app/lesson-video-input";
import { MixedText } from "@/components/app/mixed-text";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

/**
 * One lesson, as the teacher sees it — the students' lesson page.
 *
 * Deliberately the same screen: the video plays here rather than handing the
 * teacher off to YouTube, the week's homework sits underneath it, and the next
 * lesson follows on. A teacher checking a video is checking what the class will
 * see, and a page that behaved differently would not answer that question.
 *
 * Three differences, all of them the job rather than the design:
 *
 *   · Nothing is locked. The students' page 404s a week that has not opened;
 *     preparing an unopened week is exactly why a teacher is here. The release
 *     date stays on the card that got you here rather than being read off a
 *     clock during a render.
 *   · The player does not mark anything watched — see LessonPlayer's `track`.
 *   · A lesson with no video yet gets the paste-a-link control, so the empty
 *     state is the thing that fixes it rather than a dead end.
 */
export default async function TeacherLesson({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const db = await supabaseServer();

  // Everything hangs off this lesson's week, so one embed brings back the week,
  // its sibling lessons and its homework together.
  const { data: lesson } = await db
    .from("lessons")
    .select(`
      id, title, series, youtube_id, week_id, position,
      weeks(number, term_id, unlock_at, lessons(id, position, series), homeworks(number, series))
    `)
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) notFound();

  const week = lesson.weeks;
  if (!week) notFound();

  // Both lists are narrowed to this lesson's SERIES, not just its week. A week
  // can carry two courses at once — Term 3 week 1 has Tajweed 16 and TFP 1 —
  // so a week-only match would pair a lesson with another course's homework.
  const ordered = week.lessons
    .filter((l) => l.series === lesson.series)
    .sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((l) => l.id === lesson.id);
  const next = index >= 0 ? ordered[index + 1] : undefined;

  const forSeries = week.homeworks.filter((h) => h.series === lesson.series);
  const homework = forSeries.length === 1 ? forSeries[0] : null;

  const topic = blockTopic(lesson.series, week.term_id);
  const blockHref = `/teacher/curriculum/c/${lesson.series}/${week.term_id}`;

  return (
    <>
      {/* React hoists these into <head>, so the TLS handshake with YouTube is
          already done by the time the player mounts and asks for the iframe. */}
      <link rel="preconnect" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />

      <header className="masthead">
        <Crumbs
          items={[
            { label: "Curriculum", href: "/teacher/curriculum" },
            { label: topic.label, href: blockHref },
            { label: `Week ${week.number}` },
          ]}
        />
        <h1 style={{ marginTop: 16 }}>
          <MixedText text={moduleTitle(lesson.title) || lesson.title} />
        </h1>
        <div className="meta">
          <span className="label">
            Lesson {week.number}
            {ordered.length > 1 && ` of ${ordered.length} this week`} ·{" "}
            {SERIES_LABELS[lesson.series] ?? lesson.series} · Term {week.term_id}
          </span>
        </div>
      </header>

      <div className="field">
        <div className="box c12">
          {lesson.youtube_id ? (
            <LessonPlayer lessonId={lesson.id} youtubeId={lesson.youtube_id} track={false} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">
                No video on this lesson yet. Paste the YouTube link and the students
                get it the moment their week opens.
              </p>
              <LessonVideoInput lessonId={lesson.id} initial={lesson.youtube_id} />
            </div>
          )}
        </div>

        {(next || homework) && (
          <div className="box c12" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {homework && (
              <Link href={`/teacher/curriculum/${homework.number}`} className="chip due">
                This week&apos;s homework →
              </Link>
            )}
            {next && (
              <Link href={`/teacher/lessons/${next.id}`} className="chip">
                Next lesson →
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="signoff">
        <Link href={blockHref} className="lines">
          ← All modules
        </Link>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">Week {week.number}</span>
      </div>
    </>
  );
}
