import { notFound } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { findTerm } from "@/lib/curriculum/tree";
import { CourseCard } from "@/components/app/course-card";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The courses running in one term — derived from content, so a term with no
 *  Umm al-Kitāb simply doesn't show it. */
export default async function TermPage({
  params,
}: {
  params: Promise<{ term: string }>;
}) {
  const { term: termParam } = await params;
  const termId = Number(termParam);
  if (!Number.isInteger(termId)) notFound();

  const profile = (await currentProfile())!;
  const { terms } = await getStudentCurriculum(profile.id);
  const term = findTerm(terms, termId);
  if (!term) notFound();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Crumbs items={[{ label: "Courses", href: "/courses" }, { label: `Term ${term.id}` }]} />
        <header>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl">Term {term.id}</h1>
            {term.isCurrent && (
              <span className="rounded-md bg-ink/8 px-2 py-0.5 text-[11px] font-medium text-ink-2">
                Current term
              </span>
            )}
          </div>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {dmy(term.startsOn)} – {dmy(term.endsOn)} · exam out of {term.examMax}
          </p>
        </header>
      </div>

      {term.courses.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          No courses have been added to this term yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {term.courses.map((course) => (
            <CourseCard key={course.series} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
