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
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Courses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Three terms. Open a term to see the courses running inside it.
          {totalModules > 0 && (
            <> You have completed {totalDone} of the {totalModules} modules open to you so far.</>
          )}
        </p>
      </header>

      {terms.length === 0 ? (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          The year hasn&apos;t been set up yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
