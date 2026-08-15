import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { moduleTitle } from "@/lib/curriculum/tree";
import { MixedText } from "@/components/app/mixed-text";
import { StatTile } from "@/components/app/stat-tile";
import { LessonVideoInput } from "@/components/app/lesson-video-input";
import { SERIES_LABELS as SERIES } from "@/lib/lessons/series";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** The whole year, exactly as imported — teachers can audit every module. */
export default async function Curriculum() {
  const db = await supabaseServer();
  const now = Date.now();

  const [{ data: terms }, { data: weeks }, { data: lessons }, { data: homeworks },
         { data: questions }, { data: subs }] = await Promise.all([
    db.from("terms").select("id, starts_on, ends_on, exam_max").order("id"),
    db.from("weeks").select("id, term_id, number, unlock_at").order("term_id").order("number"),
    db.from("lessons").select("id, week_id, series, title, youtube_id, position").order("position"),
    db.from("homeworks").select("id, week_id, number, title, series, total_marks, due_at, is_graded").order("number"),
    db.from("questions").select("id, homework_id, points, rubric, needs_key, is_task, is_bonus, qtype"),
    db.from("submissions").select("homework_id, status"),
  ]);

  const qByHw = new Map<string, typeof questions>();
  for (const q of questions ?? []) {
    const list = qByHw.get(q.homework_id) ?? [];
    list.push(q);
    qByHw.set(q.homework_id, list);
  }
  const subByHw = new Map<string, { approved: number; pending: number }>();
  for (const s of subs ?? []) {
    const e = subByHw.get(s.homework_id) ?? { approved: 0, pending: 0 };
    if (s.status === "approved") e.approved++; else e.pending++;
    subByHw.set(s.homework_id, e);
  }

  const totalQ = questions?.length ?? 0;
  const gradedQ = (questions ?? []).filter((q) => Number(q.points) > 0).length;
  const needsRubric = (questions ?? []).filter(
    (q) => (q.qtype === "text" || q.qtype === "paragraph") && Number(q.points) > 0 && !q.rubric && !q.is_task,
  ).length;
  const needsKey = (questions ?? []).filter((q) => q.needs_key).length;

  return (
    <>
      <header className="masthead">
        <h1><span>Curriculum</span></h1>
        <p>
          Every module, homework and question as imported from the Google Forms.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Homeworks" value={homeworks?.length ?? 0} sub={`${lessons?.length ?? 0} lessons`} />
        <StatTile label="Questions" value={totalQ} sub={`${gradedQ} carry marks`} />
        <StatTile label="Need a rubric" value={needsRubric || "—"} sub="written answers marked by hand" />
        <StatTile label="Marked by hand" value={needsKey || "—"} sub="grid questions, no answer key" />
      </div>

      {(terms ?? []).map((term) => (
        <section key={term.id} className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">Term {term.id}</h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {new Date(term.starts_on).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {" – "}
              {new Date(term.ends_on).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {" · exam out of "}{term.exam_max}
            </span>
          </div>

          <div className="space-y-2">
            {(weeks ?? []).filter((w) => w.term_id === term.id).map((w) => {
              const unlocked = Date.parse(w.unlock_at) <= now;
              const wLessons = (lessons ?? []).filter((l) => l.week_id === w.id);
              const wHw = (homeworks ?? []).filter((h) => h.week_id === w.id);
              return (
                <div key={w.id} className={cn(
                  "rounded-lg border p-4",
                  unlocked ? "border-line bg-card" : "border-dashed border-line",
                )}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={cn("text-sm font-medium", !unlocked && "text-muted-foreground")}>
                      Week {w.number}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {unlocked ? "released " : "unlocks "}
                      {new Date(w.unlock_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </div>

                  {wLessons.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {wLessons.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                          <span className="w-1 shrink-0 text-muted-foreground">·</span>
                          <MixedText text={moduleTitle(l.title) || l.title} className="min-w-0" />
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {SERIES[l.series]}
                          </span>
                          <LessonVideoInput lessonId={l.id} initial={l.youtube_id} />
                        </li>
                      ))}
                    </ul>
                  )}

                  {wHw.map((h) => {
                    const qs = qByHw.get(h.id) ?? [];
                    const stats = subByHw.get(h.id);
                    const gaps = qs.filter(
                      (q) => (q.qtype === "text" || q.qtype === "paragraph") && Number(q.points) > 0 && !q.rubric && !q.is_task,
                    ).length;
                    return (
                      <Link key={h.id} href={`/teacher/curriculum/${h.number}`}
                        className="mt-3 flex items-center justify-between gap-3 rounded-md border border-line bg-page px-3 py-2 transition-colors hover:border-ink/30">
                        <span className="min-w-0">
                          <span className="text-sm font-medium">
                            {h.series === "tfp" ? "TFP" : "Homework"} {h.number > 100 ? h.number - 100 : h.number}
                          </span>
                          <MixedText text={` · ${h.title}`} className="text-xs text-muted-foreground" />
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                          {!h.is_graded && <span className="rounded bg-muted px-1.5 py-0.5">ungraded</span>}
                          {gaps > 0 && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">{gaps} no rubric</span>}
                          {stats && <span>{stats.approved} marked{stats.pending ? ` · ${stats.pending} waiting` : ""}</span>}
                          <span>{qs.length} Q · {Number(h.total_marks)} marks</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
