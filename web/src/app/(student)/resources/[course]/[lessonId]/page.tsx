import Link from "next/link";
import { notFound } from "next/navigation";
import { getResourceSet } from "@/lib/resources/queries";
import { moduleTitle } from "@/lib/curriculum/tree";
import { LessonPlayer } from "@/components/app/lesson-player";
import { MixedText } from "@/components/app/mixed-text";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

/** One resource video. Only a video in a series this class has (the
 *  class_resources row, read as the student) plays; anything else 404s. */
export default async function ResourceVideo({
  params,
}: {
  params: Promise<{ course: string; lessonId: string }>;
}) {
  const { course: key, lessonId } = await params;
  const set = await getResourceSet(key);
  const index = set ? set.videos.findIndex((v) => v.id === lessonId) : -1;
  if (!set || index < 0) notFound();
  const video = set.videos[index];
  const next = set.videos[index + 1];

  return (
    <>
      <link rel="preconnect" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />

      <header className="masthead">
        <Crumbs
          items={[
            { label: "Resources", href: "/resources" },
            { label: set.label, href: `/resources/${set.key}` },
            { label: `Video ${video.ordinal}` },
          ]}
        />
        <h1 style={{ marginTop: 16 }}>
          <MixedText text={moduleTitle(video.title) || video.title} />
        </h1>
        <div className="meta">
          <span className="label">{set.label} · video {index + 1} of {set.videos.length}</span>
        </div>
      </header>

      <div className="field player-field">
        <div className="box c12 player-box">
          <LessonPlayer lessonId={video.id} youtubeId={video.youtubeId} initiallyWatched={false} />
        </div>
        {(video.homework || next) && (
          <div className="box c12 player-acts" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {video.homework && (
              <Link href={`/homework/${video.homework.number}?from=video`} className="chip due">
                {video.homework.status && video.homework.status !== "draft"
                  ? "Your homework for this video (handed in) →"
                  : "Homework for this video →"}
              </Link>
            )}
            {next && <Link href={`/resources/${set.key}/${next.id}`} className="chip">Next video →</Link>}
            {/* Inside the box, on its own line: as a sibling of the box it
                became a cell of the field's grid, one word wide. */}
            {video.homework && (
              <p className="note" style={{ flexBasis: "100%", margin: 0 }}>
                No deadline. Do it if your teacher asks you to.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="signoff">
        <Link href={`/resources/${set.key}`} className="lines">← All videos</Link>
      </div>
    </>
  );
}
