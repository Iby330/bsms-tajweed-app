import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
import { StatTile } from "@/components/app/stat-tile";
import { homeworkLabel } from "@/components/app/homework-row";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { terms } = await getTermsAndWeeks();
  const termId = currentTermId(terms);

  const { data: myClass } = await db
    .from("classes").select("id, name").eq("teacher_id", profile.id).maybeSingle();

  const { data: pending } = await db
    .from("submissions")
    .select("id, status, submitted_at, is_late, homework_id, student_id")
    .in("status", ["submitted", "auto_marked"])
    .order("submitted_at");

  const studentIds = [...new Set((pending ?? []).map((s) => s.student_id))];
  const { data: people } = studentIds.length
    ? await db.from("profiles").select("id, full_name, class_id").in("id", studentIds)
    : { data: [] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const hwIds = [...new Set((pending ?? []).map((s) => s.homework_id))];
  const { data: hws } = hwIds.length
    ? await db.from("homeworks").select("id, number, series").in("id", hwIds)
    : { data: [] };
  const hwOf = new Map((hws ?? []).map((h) => [h.id, h]));

  const { data: roster } = myClass
    ? await db.from("profiles").select("id").eq("class_id", myClass.id).eq("role", "student").eq("is_active", true)
    : { data: [] };

  const rosterIds = (roster ?? []).map((r) => r.id);
  const { data: avgRows } = rosterIds.length
    ? await db.from("v_termly_avg").select("hw_avg").in("student_id", rosterIds).eq("term_id", termId)
    : { data: [] };
  const { data: hifzRows } = rosterIds.length
    ? await db.from("v_hifz_progress").select("pct").in("student_id", rosterIds)
    : { data: [] };

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const classAvg = mean((avgRows ?? []).map((r) => Number(r.hw_avg)));
  const hifzAvg = mean((hifzRows ?? []).map((r) => Number(r.pct)));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Assalamu alaykum, {profile.full_name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {myClass ? myClass.name : "No class assigned"} · Term {termId}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Needs my attention
        </h2>
        <div className="rounded-lg border border-line bg-card p-4">
          {pending?.length ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-3xl tabular-nums">{pending.length}</span>
                <span className="text-sm text-muted-foreground">
                  submission{pending.length === 1 ? "" : "s"} waiting for you
                </span>
              </div>
              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {pending.slice(0, 5).map((s) => {
                  const hw = hwOf.get(s.homework_id);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate">{nameOf.get(s.student_id) ?? "Student"}</span>
                        {hw && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {homeworkLabel(hw.number, hw.series)}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {s.is_late && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>}
                        {s.status === "auto_marked" ? "marked, awaiting approval" : "not yet marked"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <Link href="/teacher/review" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
                Review submissions
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing waiting — every submission is marked and approved.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">My class</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Active students" value={rosterIds.length || null} />
          <StatTile label={`Homework avg · T${termId}`} value={classAvg === null ? null : `${classAvg.toFixed(1)}%`} />
          <StatTile label="Hifz avg" value={hifzAvg === null ? null : `${hifzAvg.toFixed(1)}%`} sub="of each student's target" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/teacher/roster" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Open roster
          </Link>
          <Link href="/teacher/hifz" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Hifz register
          </Link>
        </div>
      </section>
    </div>
  );
}
