import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { getCatalogue, coursesForClass, splitCourses } from "@/lib/curriculum/catalogue";
import { findCurrentModule } from "@/lib/curriculum/tree";
import { CourseTile } from "@/components/app/course-tile";
import { Rule } from "@/components/app/rule";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The programme, one square per course.
 *
 * It used to be one square per TERM, which answered a question nobody asks: a
 * student thinks in courses — "how am I doing in Tajweed" — and terms are the
 * calendar those courses are poured into. So the index is courses now, and the
 * term drill-down still exists underneath at /courses/[term].
 *
 * Two sections, and the second is the reason for the redesign. The top is what
 * this student is actually studying. The bottom is the rest of the programme,
 * locked: courses that open later in the year, and courses another class is on.
 * That half is not navigation — it is there to show the breadth of the thing
 * they have joined, so a student who progresses quickly, or comes back next
 * year, can see what is still ahead of them.
 */
export default async function Courses() {
  const profile = (await currentProfile())!;
  const [{ terms }, { blocks: catalogue }] = await Promise.all([
    getStudentCurriculum(profile.id),
    getCatalogue(),
  ]);

  const { mine, locked } = splitCourses(catalogue, coursesForClass(profile.class_id));

  // Progress per block. The tree already counts per (term, series), which is
  // exactly a block, so this is a lookup rather than a sum.
  const progressOf = new Map<string, { done: number; total: number }>();
  for (const term of terms) {
    for (const course of term.courses) {
      progressOf.set(`${course.series} ${term.id}`, {
        done: course.doneCount,
        total: course.actionableCount,
      });
    }
  }

  const live = findCurrentModule(terms);
  const totalDone = [...progressOf.values()].reduce((n, p) => n + p.done, 0);
  const totalModules = [...progressOf.values()].reduce((n, p) => n + p.total, 0);

  return (
    <>
      <header className="masthead">
        <h1><span>Courses</span></h1>
        <p>
          {mine.length
            ? `The ${mine.length === 1 ? "topic" : mine.length + " topics"} open to you this year, and the rest of the programme below them.`
            : "Your courses will appear here as they open."}
        </p>
        {totalModules > 0 && (
          <div className="meta">
            <span className="label">{totalDone} of {totalModules} modules complete</span>
            {live && (
              <span className="label hi">
                This week · Week {live.module.weekNumber}
              </span>
            )}
          </div>
        )}
      </header>

      <Rule label="What you're studying" />

      {mine.length === 0 ? (
        <div className="field"><div className="box c12">
          <div className="note">Nothing has opened for you yet. It will appear here when it does.</div>
        </div></div>
      ) : (
        <div className="cards">
          {mine.map((block) => (
            <CourseTile
              key={`${block.series} ${block.termId}`}
              block={block}
              href={`/courses/${block.termId}/${block.series}`}
              progress={progressOf.get(`${block.series} ${block.termId}`) ?? { done: 0, total: 0 }}
            />
          ))}
        </div>
      )}

      {locked.length > 0 && (
        <>
          <Rule label="The rest of the programme" />
          <p className="note" style={{ marginBottom: 18, maxWidth: "60ch" }}>
            Not yours to open — yet. It is here so you can see how much more
            there is: what the other classes are studying, and what is waiting
            for you if you keep going.
          </p>
          <div
            className={cn("cards", locked.length < 3 && "few")}
            style={{ ["--n" as string]: locked.length }}
          >
            {locked.map(({ block, reason }) => (
              <CourseTile
                key={`${block.series} ${block.termId}`}
                block={block}
                href={null}
                reason={reason}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
