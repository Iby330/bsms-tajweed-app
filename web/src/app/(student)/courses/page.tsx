import { currentProfile } from "@/lib/supabase/server";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { getCatalogue, termIndex } from "@/lib/curriculum/catalogue";
import { getClassResources, type ResourceSet } from "@/lib/resources/queries";
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
 *
 * Between them, Reflections: Sahabah Stories and Seerah, the halaqah's
 * videos, which are no term's work. They and any other series opened for
 * the class (class_resources) were a Resources tab until 2026-11-04.
 */
const REFLECTIONS = new Set(["sahabah_t1", "seerah"]);

function SeriesTiles({ sets }: { sets: ResourceSet[] }) {
  return (
    <div className={cn("cards", sets.length < 3 && "few")} style={{ ["--n" as string]: sets.length }}>
      {sets.map((s) => (
        <CourseTile
          key={s.key}
          href={`/courses/series/${s.key}`}
          note={s.videos.some((v) => v.homework) ? "Watch any time · homework has no deadline" : "Watch any time"}
          block={{
            series: s.key, termId: null, label: s.label, parentLabel: null, blurb: "",
            slug: s.key, courseKey: s.key, moduleCount: s.videos.length, hasHomework: s.videos.some((v) => v.homework),
            posterId: s.videos[0]?.youtubeId ?? null, opensAt: null, started: true, fullyOpen: true,
          }}
        />
      ))}
    </div>
  );
}

export default async function Courses() {
  const profile = (await currentProfile())!;
  const [{ terms, hasSyllabus }, { blocks: catalogue }, sets] = await Promise.all([
    getStudentCurriculum(profile.id),
    // her section's calendar, so "opens" agrees with her tree
    getCatalogue(new Date(), profile.section),
    getClassResources(),
  ]);
  const withVideos = sets.filter((s) => s.videos.length > 0);
  const reflections = withVideos.filter((s) => REFLECTIONS.has(s.key));
  const extra = withVideos.filter((s) => !REFLECTIONS.has(s.key));

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

      {reflections.length > 0 && (
        <>
          <Rule label="Reflections" />
          <SeriesTiles sets={reflections} />
        </>
      )}

      {extra.length > 0 && (
        <>
          <Rule label="Extra videos" />
          <p className="note" style={{ marginBottom: 18, maxWidth: "60ch" }}>
            Opened for your class to go back to, whenever you need them.
          </p>
          <SeriesTiles sets={extra} />
        </>
      )}

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
