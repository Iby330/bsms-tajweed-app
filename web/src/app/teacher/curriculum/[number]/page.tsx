import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { parseOptions, parseRubric } from "@/lib/marking/objective";
import { MixedText } from "@/components/app/mixed-text";
import { StatTile } from "@/components/app/stat-tile";
import { fmtMarks } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const QTYPE: Record<string, string> = {
  mcq: "Multiple choice",
  checkbox: "Select all that apply",
  text: "Short written answer",
  paragraph: "Written answer",
  grid: "Grid",
};

const SCORING: Record<string, string> = {
  exact: "all-or-nothing",
  per_option: "one mark per correct option, wrong picks cancel",
  manual: "marked by hand",
};

/**
 * Full detail for one homework — the answer key, the rubric the model marks
 * against, and how each question is scored. Teacher-only: students reach
 * homework through get_homework_for_student(), which strips all of this.
 */
export default async function CurriculumDetail({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isFinite(n)) notFound();

  const db = await supabaseServer();
  const { data: hw } = await db
    .from("homeworks")
    .select("id, number, title, series, total_marks, due_at, is_graded, week_id")
    .eq("number", n)
    .maybeSingle();
  if (!hw) notFound();

  const [{ data: questions }, { data: week }, { data: subs }] = await Promise.all([
    db.from("questions")
      .select("id, position, qtype, scoring, prompt, points, is_bonus, is_task, options, rubric, needs_key")
      .eq("homework_id", hw.id).order("position"),
    db.from("weeks").select("term_id, number, unlock_at").eq("id", hw.week_id).maybeSingle(),
    db.from("submissions").select("status").eq("homework_id", hw.id),
  ]);

  const qs = questions ?? [];
  const marked = (subs ?? []).filter((s) => s.status === "approved").length;
  const waiting = (subs ?? []).length - marked;
  const autoMarkable = qs.filter((q) => parseOptions(q.options)?.some((o) => o.correct)).length;
  const llmMarkable = qs.filter((q) => parseRubric(q.rubric)?.length).length;
  const byHand = qs.filter(
    (q) => Number(q.points) > 0 && !q.is_task &&
      !parseOptions(q.options)?.some((o) => o.correct) && !parseRubric(q.rubric)?.length,
  ).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/teacher/curriculum" className="text-xs text-muted-foreground underline underline-offset-4">
          ← Curriculum
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl">
            {hw.series === "tfp" ? "TFP " : "Homework "}
            {hw.number > 100 ? hw.number - 100 : hw.number}
          </h1>
          <span className="text-sm text-muted-foreground">
            {week && `Term ${week.term_id} · week ${week.number}`}
            {!hw.is_graded && " · ungraded"}
          </span>
        </div>
        <MixedText text={hw.title} className="block text-sm text-muted-foreground" />
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total marks" value={fmtMarks(Number(hw.total_marks))} sub={`${qs.length} questions`} />
        <StatTile label="Marked in code" value={autoMarkable || "—"} sub="answer key present" />
        <StatTile label="Marked by AI" value={llmMarkable || "—"} sub="rubric present" />
        <StatTile label="Marked by hand" value={byHand || "—"} sub="no key or rubric" />
      </div>

      {(marked > 0 || waiting > 0) && (
        <p className="text-xs text-muted-foreground">
          {marked} submission{marked === 1 ? "" : "s"} marked and approved
          {waiting > 0 && ` · ${waiting} waiting for review`}.
        </p>
      )}

      <div className="space-y-3">
        {qs.map((q, i) => {
          const options = parseOptions(q.options);
          const rubric = parseRubric(q.rubric);
          const points = Number(q.points);
          const gap = points > 0 && !q.is_task && !options?.some((o) => o.correct) && !rubric?.length;

          return (
            <section key={q.id} className="glass rounded-2xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <span>Q{i + 1}</span>
                    <span className="normal-case">{QTYPE[q.qtype] ?? q.qtype}</span>
                    {q.is_bonus && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">bonus · excluded from total</span>}
                    {q.is_task && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">practical task</span>}
                    {q.needs_key && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn normal-case">no answer key</span>}
                  </div>
                  <MixedText text={q.prompt} variant="quran" className="mt-2 block text-[15px] leading-relaxed" />
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-heading text-lg tabular-nums">{fmtMarks(points)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {points === 1 ? "mark" : "marks"}
                  </div>
                </div>
              </div>

              {options && (
                <ul className="mt-4 space-y-1">
                  {options.map((o) => (
                    <li key={o.position} className={cn(
                      "flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                      o.correct ? "bg-ok/10" : "bg-transparent",
                    )}>
                      <span className={cn(
                        "w-6 shrink-0 text-xs",
                        o.correct ? "text-ok" : "text-muted-foreground",
                      )}>
                        {o.correct ? "✓" : o.label.replace("Option ", "")}
                      </span>
                      <MixedText text={o.value} />
                    </li>
                  ))}
                </ul>
              )}

              {rubric && (
                <div className="mt-4">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Mark scheme — the AI awards each point independently
                  </div>
                  <ul className="mt-2 space-y-1">
                    {rubric.map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3 rounded-md bg-muted px-2.5 py-1.5 text-sm">
                        <MixedText text={c.desc} className="min-w-0" />
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {fmtMarks(c.marks)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {gap && (
                <p className="mt-4 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
                  No answer key or mark scheme for this question — a teacher enters the mark
                  during review. Adding one here would let it mark automatically.
                </p>
              )}

              <p className="mt-3 text-[11px] text-muted-foreground">
                Scoring: {SCORING[q.scoring] ?? q.scoring}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
