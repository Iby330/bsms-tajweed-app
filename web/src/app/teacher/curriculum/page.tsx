import { supabaseServer } from "@/lib/supabase/server";
import { getCatalogue } from "@/lib/curriculum/catalogue";
import { CourseTile } from "@/components/app/course-tile";
import { ClassFilter } from "@/components/app/class-filter";
import { ClassScheduleEditor } from "@/components/app/schedule/class-schedule-editor";
import { getScheduleEditorData } from "@/lib/curriculum/schedule-editor-data";
import { currentProfile } from "@/lib/supabase/server";
import { homeworkScope, teacherClass } from "@/lib/teacher/scope";

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
export default async function Curriculum({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const db = await supabaseServer();
  const { class: classParam } = await searchParams;
  const [scope, me, own] = await Promise.all([homeworkScope(classParam), currentProfile(), teacherClass()]);
  // A teacher changes their own class's schedule; the programme lead any class.
  const editor = scope.selected ? await getScheduleEditorData(scope.selected.id) : null;
  const canEdit = !!scope.selected && (!!me?.is_admin || own?.id === scope.selected.id);

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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1><span>Curriculum</span></h1>
          <ClassFilter classes={scope.classes} selected={scope.selected?.id ?? null} own={scope.own} />
        </div>
        <p>
          {scope.selected
            ? `When each video and homework opens and is due for ${scope.selected.name}, and every course in the programme below.`
            : "Every course in the programme. Pick a class to see and change its schedule."}
        </p>
      </header>

      {editor ? (
        <ClassScheduleEditor
          data={editor}
          canEdit={canEdit}
          classParam={scope.selected && scope.selected.id !== scope.own ? scope.selected.id : null}
        />
      ) : scope.selected ? (
        <p className="text-sm text-muted-foreground">{scope.selected.name} has no courses set up yet, so there is no schedule to change.</p>
      ) : null}

      <div className="divider"><span className="label">Curriculum</span><span className="r" /><span className="m" /></div>
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
              // A planned term with nothing uploaded yet (Sahabah Stories before
              // its first video) has no weeks to open: shut, and saying so.
              href={block.termId && block.moduleCount > 0 ? `/teacher/curriculum/c/${block.series}/${block.termId}` : null}
              reason={block.termId && block.moduleCount === 0 ? "no-content" : undefined}
              note={
                block.termId && block.moduleCount > 0
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
