import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { findCurrentModule } from "@/lib/curriculum/tree";
import { TermCard } from "@/components/app/term-card";

export const dynamic = "force-dynamic";

/** The year, one card per term. Everything below this is a drill-down. */
export default async function Courses() {
  const profile = (await currentProfile())!;
  const { terms } = await getStudentCurriculum(profile.id);

  const live = findCurrentModule(terms);
  const totalModules = terms.reduce((n, t) => n + t.actionableCount, 0);
  const totalDone = terms.reduce((n, t) => n + t.doneCount, 0);

  return (
    <>
      <header className="masthead">
        <h1><span>Courses</span></h1>
        <p>
          Three terms. Open a term to see the courses running inside it.
          {totalModules > 0 && (
            <> You have completed {totalDone} of the {totalModules} modules open to you so far.</>
          )}
        </p>
        {totalModules > 0 && (
          <div className="meta">
            <span className="label">{terms.length} terms</span>
            <span className="label hi">{totalDone} of {totalModules} modules complete</span>
          </div>
        )}
      </header>

      {terms.length === 0 ? (
        <div className="field"><div className="box c12">
          <div className="note">The year hasn&apos;t been set up yet.</div>
        </div></div>
      ) : (
        <div className="cards">
          {terms.map((term) => (
            <TermCard
              key={term.id}
              term={term}
              thisWeek={
                term.isCurrent && live && live.termId === term.id
                  ? {
                      href: `/courses/${live.termId}/${live.series}`,
                      label: `This week · Week ${live.module.weekNumber}`,
                    }
                  : null
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
