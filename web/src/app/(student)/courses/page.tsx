import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { getCatalogue, termIndex } from "@/lib/curriculum/catalogue";
import { findCurrentModule } from "@/lib/curriculum/tree";
import { CourseTile } from "@/components/app/course-tile";
import { TermTile } from "@/components/app/term-tile";
import { Rule } from "@/components/app/rule";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The student's year, term by term, then the rest of the programme.
 *
 * Terms first because that is how the year is taught: the open term links
 * through (and straight to each course that has started), and a term still
 * ahead names what it will teach without opening it. Below, only courses
 * that are in no term of this class's plan, locked, to show the breadth of
 * the programme. A course this class takes later is in its term, not here.
 */
export default async function Courses() {
  const profile = (await currentProfile())!;
  const [{ terms, hasSyllabus }, { blocks: catalogue }] = await Promise.all([
    getStudentCurriculum(profile.id),
    // her section's calendar, so "opens" agrees with her tree
    getCatalogue(new Date(), profile.section),
  ]);

  const { terms: tiles, rest } = termIndex(catalogue, terms, hasSyllabus);

  const live = findCurrentModule(terms);
  const totalDone = terms.reduce((n, t) => n + t.doneCount, 0);
  const totalModules = terms.reduce((n, t) => n + t.actionableCount, 0);

  return (
    <>
      <header className="masthead">
        <h1><span>Courses</span></h1>
        <p>Your year, term by term, and the rest of the programme below it.</p>
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

      <Rule label="Your year" />
      <div className="cards">
        {tiles.map((tile) => <TermTile key={tile.id} tile={tile} />)}
      </div>

      {rest.length > 0 && (
        <>
          <Rule label="The rest of the programme" />
          <p className="note" style={{ marginBottom: 18, maxWidth: "60ch" }}>
            Not part of your class&apos;s plan this year. It is here so you can
            see how much more there is.
          </p>
          <div
            className={cn("cards", rest.length < 3 && "few")}
            style={{ ["--n" as string]: rest.length }}
          >
            {rest.map((tile) => (
              <CourseTile key={tile.id} block={tile.block} href={null} reason={tile.reason} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
