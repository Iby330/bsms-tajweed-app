import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getHomeLeaderboards, getClassProgress } from "@/lib/dashboard/queries";
import { StatTile } from "@/components/app/stat-tile";
import { ClassProgress } from "@/components/app/class-progress";
import { LeaderboardPanel } from "@/components/app/leaderboard-panel";
import { homeworkLabel } from "@/components/app/homework-row";
import { MixedText } from "@/components/app/mixed-text";
import { moduleTitle } from "@/lib/curriculum/tree";
import { teacherClass, teacherRoster } from "@/lib/teacher/scope";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { terms, weeks } = await getTermsAndWeeks();
  const termId = currentTermId(terms);

  const myClass = await teacherClass();

  // Same rankings the students see — the views already scope to the
  // viewer's section, and a teacher's profile carries one.
  const leaderboards = await getHomeLeaderboards(myClass?.id ?? null);
  const cohortNoun = profile.section === "sisters" ? "sisters" : "brothers";

  // the queue is this teacher's own class — someone else's marking is not
  // their problem, and mixing it in buries their twenty students in a hundred
  const roster = await teacherRoster();
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));
  const rosterIds = roster.map((s) => s.id);

  const { data: pending } = rosterIds.length
    ? await db
        .from("submissions")
        .select("id, status, submitted_at, is_late, homework_id, student_id")
        .in("status", ["submitted", "auto_marked"])
        .in("student_id", rosterIds)
        .order("submitted_at")
    : { data: [] };

  const hwIds = [...new Set((pending ?? []).map((s) => s.homework_id))];
  const { data: hws } = hwIds.length
    ? await db.from("homeworks").select("id, number, series, title").in("id", hwIds)
    : { data: [] };
  const hwOf = new Map((hws ?? []).map((h) => [h.id, h]));

  const classRows = myClass ? await getClassProgress(myClass.id, termId, weeks) : [];

  // Hifz pct is computed in SQL and stays there; deriving it from
  // passed / target here would move a verified formula into TypeScript.
  const { data: hifzRows } = rosterIds.length
    ? await db.from("v_hifz_progress").select("pct").in("student_id", rosterIds)
    : { data: [] };

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const classAvg = mean(classRows.map((r) => r.hwAvg).filter((v): v is number => v !== null));
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
        <div className="glass rounded-2xl p-4">
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
                  // seed titles repeat their own designation ("Tajweed
                  // Homework 21: Waqf wa Ibtidah") — the label already says it
                  const title = hw ? moduleTitle(hw.title) : "";
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate">{nameOf.get(s.student_id) ?? "Student"}</span>
                        {hw && (
                          <span className="min-w-0 truncate text-xs text-muted-foreground">
                            {homeworkLabel(hw.number, hw.series)}
                            {title && (
                              <>
                                {" · "}
                                <MixedText text={title} />
                              </>
                            )}
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
              <Link href="/teacher/homework" className={cn(buttonVariants({ size: "sm" }), "mt-4")}>
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
          <StatTile label="Active students" value={roster.length || null} />
          <StatTile label={`Homework avg · T${termId}`} value={classAvg === null ? null : `${classAvg.toFixed(1)}%`} />
          <StatTile label="Hifz avg" value={hifzAvg === null ? null : `${hifzAvg.toFixed(1)}%`} sub="of each student's target" />
        </div>

        <ClassProgress rows={classRows} termId={termId} />

        <div className="flex flex-wrap gap-2">
          <Link href="/teacher/roster" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Open roster
          </Link>
          <Link href="/teacher/hifz" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Hifz register
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Leaderboards</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <LeaderboardPanel
            title="Homework"
            scopes={[
              // No selfName to highlight — the teacher isn't in the ranking,
              // so the collapsed view shows the top three instead.
              ...(myClass
                ? [{
                    key: "class",
                    label: "My class",
                    rows: leaderboards.homework.mine,
                    selfName: "",
                    noun: "in my class",
                  }]
                : []),
              {
                key: "cohort",
                label: `All ${cohortNoun}`,
                rows: leaderboards.homework.cohort,
                selfName: "",
                noun: cohortNoun,
              },
            ]}
          />
          <LeaderboardPanel
            title="Hifz"
            scopes={[
              ...(myClass
                ? [{
                    key: "class",
                    label: "My class",
                    rows: leaderboards.hifz.mine,
                    selfName: "",
                    noun: "in my class",
                  }]
                : []),
              {
                key: "classes",
                label: "All classes",
                rows: leaderboards.hifz.classes,
                // Rows are classes here — highlight the teacher's own.
                selfName: myClass?.name ?? "",
                noun: "classes",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
