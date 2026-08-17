import { supabaseServer } from "@/lib/supabase/server";
import { getCatalogue } from "@/lib/curriculum/catalogue";
import { CourseTile } from "@/components/app/course-tile";

export const dynamic = "force-dynamic";

/**
 * The programme, exactly as the students see it.
 *
 * Two things this page used to be and is not any more. It was a stack of
 * collapsed term folders — every week of the year as rows to hunt through. And
 * it was an audit dashboard: counts of questions, questions without a rubric,
 * questions with no answer key. Those numbers described the shape of the import,
 * not the teaching, and no one was going to act on "23 written answers marked by
 * hand" — the marking screen already says so where it matters, on the script in
 * front of you.
 *
 * So it is the students' grid, cover art and all, and the only difference is
 * that a teacher can open everything: preparing Term 3 during Term 1 is the job,
 * so no tile is ever locked for want of an unlock date. Clicking one opens its
 * weeks, where the videos are attached and the homework lives.
 */
export default async function Curriculum() {
  const db = await supabaseServer();

  const [{ blocks }, { data: weeks }, { data: lessons }, { data: homeworks }] = await Promise.all([
    getCatalogue(),
    db.from("weeks").select("id, term_id"),
    db.from("lessons").select("week_id, series, youtube_id"),
    db.from("homeworks").select("week_id, series"),
  ]);

  const termOf = new Map((weeks ?? []).map((w) => [w.id, w.term_id]));
  const inBlock = (row: { week_id: string; series: string }, series: string, termId: number | null) =>
    row.series === series && termOf.get(row.week_id) === termId;

  return (
    <>
      <header className="masthead">
        <h1><span>Curriculum</span></h1>
        <p>
          Every course in the programme, open to you whether or not it has
          reached the students yet. Open one to attach a video or look at a
          homework.
        </p>
      </header>

      <div className="cards">
        {blocks.map((block) => {
          const videos = (lessons ?? []).filter(
            (l) => inBlock(l, block.series, block.termId) && l.youtube_id,
          ).length;
          const hw = (homeworks ?? []).filter((h) => inBlock(h, block.series, block.termId)).length;
          return (
            <CourseTile
              key={`${block.series} ${block.termId}`}
              block={block}
              href={block.termId ? `/teacher/curriculum/c/${block.series}/${block.termId}` : null}
              note={
                block.termId
                  ? `${videos} of ${block.moduleCount} with video` +
                    (hw ? ` · ${hw} homework` : "")
                  : undefined
              }
            />
          );
        })}
      </div>
    </>
  );
}
