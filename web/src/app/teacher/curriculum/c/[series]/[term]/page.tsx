import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { blockTopic } from "@/lib/curriculum/catalogue";
import { getCurriculumTree } from "@/lib/curriculum/queries";
import { findCourse } from "@/lib/curriculum/tree";
import { teacherRoster } from "@/lib/teacher/scope";
import { TeacherModuleCard } from "@/components/app/teacher-module-card";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

/**
 * One topic block, week by week — the teacher's side of a course.
 *
 * The same grid of module cards the students get at /courses/[term]/[series],
 * because the year should look like one thing described twice, not two
 * different products. What changes is what a card does: the poster opens the
 * video, the video id is pasted in from the card itself, and the homework opens
 * the class's results rather than a form.
 *
 * Nothing is hidden by unlock date — preparing next term is the job — so an
 * unreleased week is a full card wearing its release date.
 */
export default async function CurriculumBlock({
  params,
}: {
  params: Promise<{ series: string; term: string }>;
}) {
  const { series: seriesParam, term: termParam } = await params;
  const termId = Number(termParam);
  if (!Number.isInteger(termId)) notFound();

  // `series` is an enum column, so the URL segment has to be narrowed to one of
  // its labels before it can be a filter — an unknown one is a 404, not a query.
  const SERIES_KEYS = ["tajweed", "umm_al_kitab", "tfp", "seerah"] as const;
  const series = SERIES_KEYS.find((k) => k === seriesParam);
  if (!series) notFound();

  const [terms, roster] = await Promise.all([getCurriculumTree(), teacherRoster()]);
  const course = findCourse(terms, termId, series);
  if (!course) notFound();

  const topic = blockTopic(series, termId);
  const homeworkIds = course.modules
    .map((m) => m.homework?.id)
    .filter((id): id is string => Boolean(id));

  // Marking progress, scoped to the teacher's own class the way every other
  // teacher screen is: a demo teacher counting the whole programme's
  // submissions would read their four students as a hundred and six.
  const db = await supabaseServer();
  const studentIds = roster.map((s) => s.id);
  const { data: subs } =
    homeworkIds.length && studentIds.length
      ? await db
          .from("submissions")
          .select("homework_id, status")
          .in("homework_id", homeworkIds)
          .in("student_id", studentIds)
          .in("status", ["submitted", "auto_marked", "approved"])
      : { data: [] as { homework_id: string; status: string }[] };

  const statsByHw = new Map<string, { marked: number; waiting: number }>();
  for (const s of subs ?? []) {
    const e = statsByHw.get(s.homework_id) ?? { marked: 0, waiting: 0 };
    if (s.status === "approved") e.marked++;
    else e.waiting++;
    statsByHw.set(s.homework_id, e);
  }

  const released = course.modules.filter((m) => m.unlocked).length;
  const withVideo = course.modules.filter((m) =>
    m.lessons.some((l) => l.youtube_id),
  ).length;

  return (
    <>
      <header className="masthead">
        <Crumbs
          items={[
            { label: "Curriculum", href: "/teacher/curriculum" },
            { label: topic.label },
          ]}
        />
        <h1 style={{ marginTop: 16 }}><b>{topic.label}</b></h1>
        <p>
          {topic.parentLabel ? `${topic.parentLabel} · ` : ""}Term {termId}.{" "}
          {topic.blurb}
        </p>
        <div className="meta">
          <span className="label">
            {course.moduleCount} {course.moduleCount === 1 ? "module" : "modules"} ·{" "}
            {withVideo} with video
          </span>
          <span className={released < course.moduleCount ? "label" : "label hi"}>
            {released === course.moduleCount
              ? "All released"
              : `${released} of ${course.moduleCount} released`}
          </span>
        </div>
      </header>

      <ul className="cards">
        {course.modules.map((m) => {
          const stats = m.homework ? statsByHw.get(m.homework.id) : undefined;
          return (
            <TeacherModuleCard
              key={m.weekId}
              module={m}
              series={course.series}
              homeworkHref={
                m.homework ? `/teacher/curriculum/${m.homework.number}` : null
              }
              homeworkNote={
                m.homework
                  ? stats
                    ? `${stats.marked} marked` +
                      (stats.waiting ? ` · ${stats.waiting} waiting` : "")
                    : roster.length
                      ? "none in yet"
                      : undefined
                  : undefined
              }
            />
          );
        })}
      </ul>
    </>
  );
}
