import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { moduleTitle } from "@/lib/curriculum/tree";
import { seriesShort } from "@/lib/lessons/series";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * One homework, every student. Grouped by class so a teacher scans their own
 * first; approved rows carry the mark and stay clickable — opening one lands
 * on the marking screen where marks can still be edited.
 */
export default async function TeacherHomeworkDetail({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n)) notFound();

  const db = await supabaseServer();
  const { data: hw } = await db
    .from("homeworks")
    .select("id, week_id, number, title, series, total_marks, is_graded")
    .eq("number", n)
    .maybeSingle();
  if (!hw) notFound();

  const [{ data: week }, { data: subs }, { data: students }, { data: classes }, { data: pcts }] =
    await Promise.all([
      db.from("weeks").select("term_id, number").eq("id", hw.week_id).maybeSingle(),
      // drafts are the student's own business — a teacher can't review one
      db.from("submissions")
        .select("id, status, is_late, student_id")
        .eq("homework_id", hw.id)
        .in("status", ["submitted", "auto_marked", "approved"]),
      db.from("profiles")
        .select("id, full_name, class_id, is_active")
        .eq("role", "student")
        .eq("is_active", true)
        .order("full_name"),
      db.from("classes").select("id, name, section").order("section").order("name"),
      db.from("v_hw_pct").select("student_id, pct").eq("homework_id", hw.id),
    ]);

  const subByStudent = new Map((subs ?? []).map((s) => [s.student_id, s]));
  const pctByStudent = new Map((pcts ?? []).map((p) => [p.student_id as string, Number(p.pct)]));

  const byClass = new Map<string, typeof students>();
  for (const s of students ?? []) {
    if (!s.class_id) continue;
    const list = byClass.get(s.class_id) ?? [];
    list.push(s);
    byClass.set(s.class_id, list);
  }

  const title = moduleTitle(hw.title);
  const approved = (subs ?? []).filter((s) => s.status === "approved").length;
  const waiting = (subs ?? []).filter((s) => s.status === "submitted" || s.status === "auto_marked").length;
  const missing = (students ?? []).filter((s) => !subByStudent.has(s.id)).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/teacher/homework" className="text-xs text-muted-foreground underline underline-offset-4">
          ← Homework
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl">{homeworkLabel(hw.number, hw.series)}</h1>
          <span className="text-sm text-muted-foreground">
            {seriesShort(hw.series)}
            {week && <> · Term {week.term_id}, week {week.number}</>}
            {" · out of "}{Number(hw.total_marks)}
            {!hw.is_graded && " · ungraded"}
          </span>
        </div>
        {title && <MixedText text={title} className="block text-sm text-muted-foreground" />}
        <p className="text-xs tabular-nums text-muted-foreground">
          {approved} marked · {waiting} waiting · {missing} not submitted
        </p>
      </header>

      {(classes ?? []).map((c) => {
        const roster = byClass.get(c.id);
        if (!roster?.length) return null;
        return (
          <section key={c.id} className="space-y-2">
            <h2 className="text-sm font-medium">{c.name}</h2>
            <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
              {roster.map((s) => {
                const sub = subByStudent.get(s.id);
                const pct = pctByStudent.get(s.id);
                const row = (
                  <>
                    <span className="min-w-0 truncate text-sm font-medium">{s.full_name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      {sub?.is_late && (
                        <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>
                      )}
                      {!sub ? (
                        <span className="text-muted-foreground">not submitted</span>
                      ) : sub.status === "approved" ? (
                        <>
                          {pct !== undefined && (
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 font-medium tabular-nums",
                                pct >= 80 && "bg-ok/12 text-ok",
                                pct >= 50 && pct < 80 && "bg-warn/12 text-warn",
                                pct < 50 && "bg-danger/12 text-danger",
                              )}
                            >
                              {Math.round(pct)}%
                            </span>
                          )}
                          <span className="text-muted-foreground">approved</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {sub.status === "auto_marked" ? "marked, awaiting approval" : "not yet marked"}
                        </span>
                      )}
                    </span>
                  </>
                );
                return (
                  <li key={s.id}>
                    {sub ? (
                      <Link
                        href={`/teacher/homework/submission/${sub.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-4 py-2.5 opacity-70">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
