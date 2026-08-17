import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { ModulePoster } from "@/components/app/module-card";
import { LessonVideoInput } from "@/components/app/lesson-video-input";
import { homeworkLabel } from "@/components/app/homework-row";
import { moduleTitle, type Module } from "@/lib/curriculum/tree";

/** unlock_at is a timestamptz — the release moment, not a calendar day — so it
 *  is formatted in the viewer's own zone. See fmtDay's warning in lib/format. */
const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * One week of a course as the teacher's card — the students' module card with
 * the two things only a teacher does attached.
 *
 * Same title strip, same 16:9 poster, same actions rail, so the two sides of
 * the app describe the year in the same shape. The differences are exactly the
 * job: the poster opens the video on YouTube rather than the student player
 * (which records a watch against whoever is looking, and a teacher is not a
 * student), the video id can be pasted in from here, and the homework leads to
 * the class's results rather than to a form to fill in.
 *
 * Nothing is ever locked. Preparing next term during this one is the work, so
 * an unreleased week says when it opens and stays fully usable.
 */
export function TeacherModuleCard({
  module: m,
  series,
  homeworkHref,
  homeworkNote,
}: {
  module: Module;
  /** Course series key, for the placeholder label on an empty poster. */
  series: string;
  /** Where this week's results live. Null when the week has no homework. */
  homeworkHref: string | null;
  /** How the class is doing on it — "6 marked · 2 waiting". */
  homeworkNote?: string;
}) {
  // The poster comes from the first lesson that has a video, exactly as the
  // student card picks it; the video inputs below cover every lesson regardless.
  const poster = m.lessons.find((l) => l.youtube_id) ?? m.lessons[0];

  return (
    <li className="tcard overflow-hidden" style={{ padding: 0, gap: 0 }}>
      {/* ── title strip ── */}
      <div className="flex items-baseline gap-2 px-3 py-2">
        {m.title ? (
          <MixedText
            text={m.title}
            className="line-clamp-1 min-w-0 flex-1 text-sm font-medium leading-snug"
          />
        ) : (
          <span className="min-w-0 flex-1" />
        )}
        <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
          Week {m.weekNumber}
        </span>
      </div>

      <div className="relative">
        {poster ? (
          <Link
            href={`/teacher/lessons/${poster.id}`}
            className="group block"
            aria-label={`Open week ${m.weekNumber}`}
          >
            <ModulePoster youtubeId={poster.youtube_id} series={series} />
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <span aria-hidden>▸</span> {poster.youtube_id ? "Watch" : "Open"}
            </span>
          </Link>
        ) : (
          <ModulePoster youtubeId={null} series={series} />
        )}

        {/* Released or not is still worth saying — it is the difference between
            a week the students are on and one you are getting ready. */}
        {!m.unlocked && (
          <span className="absolute left-2 top-2 rounded bg-page/85 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground backdrop-blur-sm">
            opens {dm(m.unlockAt)}
          </span>
        )}
      </div>

      {/* ── actions ── */}
      <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
        {/* The input says it all in its collapsed state — the video id, or "no
            video" in warn — so nothing here repeats it. */}
        {m.lessons.map((l) => (
          <div
            key={l.id}
            className="flex flex-wrap items-center justify-end gap-2 text-xs"
          >
            {m.lessons.length > 1 && (
              <MixedText
                text={moduleTitle(l.title) || l.title}
                className="mr-auto min-w-0 truncate text-muted-foreground"
              />
            )}
            <LessonVideoInput lessonId={l.id} initial={l.youtube_id} />
          </div>
        ))}

        {m.lessons.length === 0 && (
          <p className="text-xs text-muted-foreground">No lesson this week.</p>
        )}

        {m.homework && homeworkHref ? (
          <Link
            href={homeworkHref}
            className="mt-auto flex items-center justify-between gap-2 rounded-md border border-line bg-page px-2.5 py-1.5 text-xs transition-colors hover:border-ink/30"
          >
            <span className="font-medium">
              {homeworkLabel(m.homework.number, m.homework.series)}
              {!m.homework.is_graded && (
                <span className="ml-1.5 font-normal text-muted-foreground">ungraded</span>
              )}
            </span>
            {homeworkNote && (
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {homeworkNote}
              </span>
            )}
          </Link>
        ) : (
          <p className="mt-auto text-xs text-muted-foreground">No homework this week.</p>
        )}
      </div>
    </li>
  );
}
