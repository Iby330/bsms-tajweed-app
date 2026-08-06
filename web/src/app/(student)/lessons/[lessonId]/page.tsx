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

  const { data: lesson } = await db
    .from("lessons")
    .select("id, title, series, youtube_id, week_id, position")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) notFound();

  const { data: week } = await db
    .from("weeks")
    .select("id, number, term_id, unlock_at")
    .eq("id", lesson.week_id)
    .maybeSingle();

  // A locked week's lesson is simply not there yet, as far as a student is
  // concerned — no teasing them with a title they can't open.
  if (!week || Date.parse(week.unlock_at) > Date.now()) notFound();

  // Both queries are scoped to this lesson's SERIES, not just its week. A week
  // can carry two courses at once — Term 3 week 1 has Tajweed 16 and TFP 1 —
  // so a week-only match would pair a lesson with another course's homework
  // (and `.maybeSingle()` would return nothing at all).
  const [{ data: siblings }, { data: watch }, { data: homework }] = await Promise.all([
    db
      .from("lessons")
      .select("id, title, position")
      .eq("week_id", week.id)
      .eq("series", lesson.series)
      .order("position"),
    db
      .from("lesson_watches")
      .select("lesson_id")
      .eq("student_id", profile.id)
      .eq("lesson_id", lesson.id)
      .maybeSingle(),
    db
      .from("homeworks")
      .select("number, title")
      .eq("week_id", week.id)
      .eq("series", lesson.series)
      .maybeSingle(),
  ]);

  const ordered = siblings ?? [];
  const index = ordered.findIndex((l) => l.id === lesson.id);
  const next = index >= 0 ? ordered[index + 1] : undefined;

  return (
    <div className="space-y-6">
      <div>
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
        <h1 className="mt-2">
          <MixedText text={lesson.title} className="text-2xl leading-tight" />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {SERIES_LABELS[lesson.series] ?? lesson.series} · Week {week.number} · Term {week.term_id}
          {ordered.length > 1 && ` · lesson ${index + 1} of ${ordered.length}`}
        </p>
      </div>

      {lesson.youtube_id ? (
        <LessonPlayer
          lessonId={lesson.id}
          youtubeId={lesson.youtube_id}
          initiallyWatched={Boolean(watch)}
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-line bg-card px-6 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            The video for this lesson hasn&apos;t been uploaded yet. Your teacher
            will add it — check back soon.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {next && (
          <Link
            href={`/lessons/${next.id}`}
            className="rounded-md border border-line px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            Next lesson →
          </Link>
        )}
        {homework && (
          <Link
            href={`/homework/${homework.number}`}
            className="rounded-md border border-line px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            This week&apos;s homework
          </Link>
        )}
      </div>
    </div>
  );
}
