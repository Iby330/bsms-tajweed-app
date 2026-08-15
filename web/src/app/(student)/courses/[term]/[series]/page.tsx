import { notFound } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { findCourse, findTerm } from "@/lib/curriculum/tree";
import { seriesShort } from "@/lib/lessons/series";
import { ModuleCard } from "@/components/app/module-card";
import { ProgressBar } from "@/components/app/progress-bar";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

/** One course, its weeks laid out as modules. The leaf of the drill-down —
 *  from here you go to a video or a homework, not deeper into the tree. */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ term: string; series: string }>;
}) {
  const { term: termParam, series } = await params;
  const termId = Number(termParam);
  if (!Number.isInteger(termId)) notFound();

  const profile = (await currentProfile())!;
  const { terms, pctByHomeworkId } = await getStudentCurriculum(profile.id);

  const term = findTerm(terms, termId);
  const course = findCourse(terms, termId, series);
  if (!term || !course) notFound();

  // Locked lessons/homeworks are filtered out by RLS before they ever reach
  // here, so "how many modules does this course have" is unanswerable. The
  // term's calendar is knowable, and that is what we tell the student.
  const nextUnlock = term.lockedWeeks[0];

  return (
    <>
      <header className="masthead">
        <Crumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: `Term ${term.id}`, href: `/courses/${term.id}` },
            { label: seriesShort(course.series) },
          ]}
        />
        <h1 style={{ marginTop: 16 }}>
          <b>{course.label}</b>
        </h1>
        <p>
          Every module in this course, week by week. Open one to watch the lesson and
          hand in its homework.
        </p>
        <div className="meta">
          <span className="label">
            Term {term.id} · {course.moduleCount}{" "}
            {course.moduleCount === 1 ? "module" : "modules"} released
          </span>
          <span className="label hi">
            {course.doneCount} of {course.actionableCount} complete
          </span>
        </div>
        <div style={{ marginTop: 18, maxWidth: 360 }}>
          <ProgressBar
            done={course.doneCount}
            total={course.actionableCount}
            emptyNote="Nothing to do yet, the videos aren't up"
            label={`${course.label}: ${course.doneCount} of ${course.actionableCount} modules complete`}
          />
        </div>
      </header>

      <ul className="cards">
        {course.modules.map((m) => (
          <ModuleCard
            key={m.weekId}
            module={m}
            series={course.series}
            pct={m.homework ? pctByHomeworkId.get(m.homework.id) : undefined}
          />
        ))}

        {nextUnlock && (
          <li className="tcard justify-center">
            <p className="note">
              Week {nextUnlock.number} unlocks{" "}
              <span className="tabular-nums text-foreground">
                {new Date(nextUnlock.unlockAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                })}
              </span>
              {term.lockedWeeks.length > 1 &&
                `, then ${term.lockedWeeks.length - 1} more after that`}
              .
            </p>
          </li>
        )}
      </ul>
    </>
  );
}
