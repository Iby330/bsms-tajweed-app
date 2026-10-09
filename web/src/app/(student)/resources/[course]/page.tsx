import Link from "next/link";
import { notFound } from "next/navigation";
import { getResourceSet } from "@/lib/resources/queries";
import { moduleTitle } from "@/lib/curriculum/tree";
import { thumbnailUrl } from "@/lib/lessons/youtube";
import { MixedText } from "@/components/app/mixed-text";
import { Crumbs } from "@/components/app/crumbs";

export const dynamic = "force-dynamic";

/** A resource course's videos as a grid: each opens its player. Nothing here
 *  is a module: no week, no homework, no progress. */
export default async function ResourceCourse({ params }: { params: Promise<{ course: string }> }) {
  const { course: key } = await params;
  const set = await getResourceSet(key);
  if (!set) notFound();

  return (
    <>
      <header className="masthead">
        <Crumbs items={[{ label: "Resources", href: "/resources" }, { label: set.label }]} />
        <h1 style={{ marginTop: 16 }}><b>{set.label}</b></h1>
        <p>Every video in the series, to go back to whenever you need. Where a video has homework it is linked under the video, with no deadline: do it if your teacher asks you to.</p>
        <div className="meta">
          <span className="label">{set.videos.length} {set.videos.length === 1 ? "video" : "videos"}</span>
        </div>
      </header>

      {set.videos.length === 0 ? (
        <div className="field"><p className="box c12 note">No videos in this series yet.</p></div>
      ) : (
        <ul className="cards">
          {set.videos.map((v) => (
            <li key={v.id} className="contents">
              <Link href={`/resources/${set.key}/${v.id}`} className="tcard cover-card">
                <div className="cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnailUrl(v.youtubeId)!} alt="" width={1280} height={720} loading="lazy" />
                </div>
                <div className="tbody">
                  <span className="label">
                    Video {v.ordinal}
                    {v.homework && (v.homework.status && v.homework.status !== "draft" ? " · homework handed in" : " · has homework")}
                  </span>
                  <h2><MixedText text={moduleTitle(v.title) || v.title} /></h2>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
