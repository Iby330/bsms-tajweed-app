import { getClassResources } from "@/lib/resources/queries";
import { CourseTile } from "@/components/app/course-tile";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Extra material a class can go back to, outside its plan. Today that is
 * another course's videos (class_resources, 0075); a class with none sees
 * the page say so rather than a greyed-out tab.
 */
export default async function Resources() {
  const sets = await getClassResources();

  return (
    <>
      <header className="masthead">
        <h1><span>Resources</span></h1>
        <p>Extra videos your teacher has opened for your class to go back to, whenever you need them. Any homework with them has no deadline.</p>
      </header>

      {sets.length === 0 ? (
        <div className="field">
          <p className="box c12 note">
            Nothing here for your class yet. When your teacher adds something for you, it will appear here.
          </p>
        </div>
      ) : (
        <div className={cn("cards", sets.length < 3 && "few")} style={{ ["--n" as string]: sets.length }}>
          {sets.map((s) => (
            <CourseTile
              key={s.key}
              href={`/resources/${s.key}`}
              note={`${s.videos.length} ${s.videos.length === 1 ? "video" : "videos"} · watch any time${s.videos.some((v) => v.homework) ? " · homework with no deadline" : ""}`}
              block={{
                series: s.key, termId: null, label: s.label, parentLabel: null, blurb: "",
                slug: s.key, courseKey: s.key, moduleCount: s.videos.length, hasHomework: s.videos.some((v) => v.homework),
                posterId: s.videos[0]?.youtubeId ?? null, opensAt: null, started: true, fullyOpen: true,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
