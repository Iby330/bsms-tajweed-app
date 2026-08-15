import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { scopeLabel, teacherRoster } from "@/lib/teacher/scope";
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

  // The week rides along on the homework's own foreign key, and the teacher's
  // class is an independent lookup — so both start together. Only the roster
  // has to wait on the class, and only the submission reads on the roster.
  const [{ data: hw }, label] = await Promise.all([
    db
      .from("homeworks")
      .select("id, week_id, number, title, series, total_marks, is_graded, weeks(term_id, number)")
      .eq("number", n)
      .maybeSingle(),
    scopeLabel(),
  ]);
  if (!hw) notFound();

  const week = hw.weeks;
  const students = await teacherRoster();
  const studentIds = students.map((s) => s.id);

  const [{ data: subs }, { data: pcts }] = await Promise.all([
    // drafts are the student's own business — a teacher can't review one
    studentIds.length
      ? db.from("submissions")
          .select("id, status, is_late, student_id")
          .eq("homework_id", hw.id)
          .in("student_id", studentIds)
          .in("status", ["submitted", "auto_marked", "approved"])
      : Promise.resolve({ data: [] as { id: string; status: string; is_late: boolean; student_id: string }[] }),
    // v_hw_pct is a view, so it cannot be embedded — it stays its own read
    studentIds.length
      ? db.from("v_hw_pct").select("student_id, pct").eq("homework_id", hw.id).in("student_id", studentIds)
      : Promise.resolve({ data: [] as { student_id: string; pct: number }[] }),
  ]);

  const subByStudent = new Map((subs ?? []).map((s) => [s.student_id, s]));
  const pctByStudent = new Map((pcts ?? []).map((p) => [p.student_id as string, Number(p.pct)]));

  const title = moduleTitle(hw.title);
  const approved = (subs ?? []).filter((s) => s.status === "approved").length;
  const waiting = (subs ?? []).filter((s) => s.status === "submitted" || s.status === "auto_marked").length;
  const missing = students.filter((s) => !subByStudent.has(s.id)).length;

  return (
    <>
      <header className="masthead">
        <Link href="/teacher/homework" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Homework
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1><b>{homeworkLabel(hw.number, hw.series)}</b></h1>
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

      {students.length === 0 ? (
        <p className="empty">
          No active students yet.
        </p>
      ) : (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">{label}</h2>
            <ul className="box c12 divide-y divide-line" style={{ padding: 0, gap: 0 }}>
              {students.map((s) => {
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
      )}
    </>
  );
}
