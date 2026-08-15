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
    <>
      <header className="masthead">
        <Crumbs items={[{ label: "Courses", href: "/courses" }, { label: `Term ${term.id}` }]} />
        <h1 style={{ marginTop: 16 }}>
          <b>Term {term.id}</b>
        </h1>
        <p>
          {dmy(term.startsOn)} to {dmy(term.endsOn)}. The exam at the end of this term is
          out of {term.examMax}.
        </p>
        <div className="meta">
          <span className="label">
            {term.courses.length} {term.courses.length === 1 ? "course" : "courses"}
          </span>
          {term.isCurrent && <span className="label hi">Current term</span>}
        </div>
      </header>

      {term.courses.length === 0 ? (
        <div className="field"><div className="box c12">
          <div className="note">No courses have been added to this term yet.</div>
        </div></div>
      ) : (
        <div className="cards">
          {term.courses.map((course) => (
            <CourseCard key={course.series} course={course} />
          ))}
        </div>
      )}
    </>
  );
}
