import { notFound } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { getCatalogue, courseIndex } from "@/lib/curriculum/catalogue";
import { findTerm } from "@/lib/curriculum/tree";
import { CourseTile } from "@/components/app/course-tile";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

const dmy = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** The courses running in one term, each as a tile with its first video as the
 *  cover. A course opens only once something in it has: one still ahead says
 *  when, and one with nothing in it yet carries its name alone. */
export default async function TermPage({
  params,
}: {
  params: Promise<{ term: string }>;
}) {
  const { term: termParam } = await params;
  const termId = Number(termParam);
  if (!Number.isInteger(termId)) notFound();

  const profile = (await currentProfile())!;
  const [{ terms, hasSyllabus }, { blocks: catalogue }] = await Promise.all([
    getStudentCurriculum(profile.id),
    // her section's calendar, so "opens" agrees with her tree
    getCatalogue(new Date(), profile.section),
  ]);
  const term = findTerm(terms, termId);
  if (!term) notFound();

  // courseIndex dresses every course of the year; this page wants one term's
  const { mine, locked } = courseIndex(catalogue, terms, hasSyllabus);
  const tiles = [...mine, ...locked].filter((t) => t.id.startsWith(`${term.id} `));
  const order = new Map(term.courses.map((c, i) => [`${term.id} ${c.series}`, i]));
  tiles.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

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
          {tiles.map((tile) => (
            <CourseTile
              key={tile.id}
              block={tile.block}
              href={tile.href}
              reason={tile.reason}
              progress={tile.progress}
            />
          ))}
        </div>
      )}
    </>
  );
}
