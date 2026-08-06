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
    <div className="space-y-8">
      <div className="space-y-3">
        <Crumbs
          items={[
            { label: "Courses", href: "/courses" },
            { label: `Term ${term.id}`, href: `/courses/${term.id}` },
            { label: seriesShort(course.series) },
          ]}
        />
        <header>
          <h1 className="text-2xl">{course.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Term {term.id} · {course.moduleCount}{" "}
            {course.moduleCount === 1 ? "module" : "modules"} released
          </p>
        </header>
        <ProgressBar
          done={course.doneCount}
          total={course.actionableCount}
          className="max-w-sm"
          emptyNote="Nothing to do yet — the videos aren't up"
          label={`${course.label}: ${course.doneCount} of ${course.actionableCount} modules complete`}
        />
      </div>

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {course.modules.map((m) => (
          <ModuleCard
            key={m.weekId}
            module={m}
            series={course.series}
            pct={m.homework ? pctByHomeworkId.get(m.homework.id) : undefined}
          />
        ))}

        {nextUnlock && (
          <li className="flex items-center justify-center rounded-xl border border-dashed border-line p-6">
            <p className="text-center text-sm text-muted-foreground">
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
    </div>
  );
}
