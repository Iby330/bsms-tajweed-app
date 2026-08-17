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
import type { ClassRow } from "@/lib/teacher/class-progress";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  // Who this teacher is responsible for. `teacherRoster` chains off
  // `teacherClass` internally, but both are React-cached, so asking for them
  // together costs one class read and one roster read — not two of each.
  const [myClass, roster, { terms, weeks }] = await Promise.all([
    teacherClass(),
    teacherRoster(),
    getTermsAndWeeks(),
  ]);

  const termId = currentTermId(terms);
  // Whose ranking the cohort scope shows. 'demo' is a training cohort of its
  // own — the leaderboard views filter on the viewer's section, so a demo
  // teacher's "everyone" IS the demo classes, and calling it "All brothers"
  // (the old fallback for anything that was not 'sisters') named the wrong
  // people entirely.
  const cohortNoun =
    profile.section === "sisters" ? "sisters"
    : profile.section === "demo" ? "demo classes"
    : "brothers";

  // the queue is this teacher's own class — someone else's marking is not
  // their problem, and mixing it in buries their twenty students in a hundred
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));
  const rosterIds = roster.map((s) => s.id);

  // Everything the screen shows, in one wave. A teacher with no class of
  // their own has no class-scoped figures, so those arms resolve to nothing
  // rather than querying for a scope that does not exist.
  const classRowsPromise: Promise<ClassRow[]> = myClass
    ? getClassProgress(myClass.id, termId, weeks, roster)
    : Promise.resolve([]);

  const [leaderboards, submissions, classRows, hifz] = await Promise.all([
    // Same rankings the students see — the views already scope to the
    // viewer's section, and a teacher's profile carries one.
    getHomeLeaderboards(myClass?.name ?? null),
    // The homework each submission belongs to rides along on the same round
    // trip. Collecting the ids and fetching them afterwards was a second hop
    // that could only ever return rows this query already knows about.
    rosterIds.length
      ? db
          .from("submissions")
          .select(
            "id, status, submitted_at, is_late, homework_id, student_id, homeworks(id, number, series, title)",
          )
          .in("status", ["submitted", "auto_marked"])
          .in("student_id", rosterIds)
          .order("submitted_at")
      : Promise.resolve({ data: null }),
    classRowsPromise,
    // Hifz pct is computed in SQL and stays there; deriving it from
    // passed / target here would move a verified formula into TypeScript.
    rosterIds.length
      ? db.from("v_hifz_progress").select("pct").in("student_id", rosterIds)
      : Promise.resolve({ data: null }),
  ]);

  const pending = submissions.data ?? [];
  const hifzRows = hifz.data ?? [];
  // A homework the reader cannot see comes back null — the row still renders,
  // exactly as it did when the follow-up query returned nothing for it.
  const hwOf = new Map(
    pending.flatMap((s) => (s.homeworks ? [[s.homework_id, s.homeworks] as const] : [])),
  );

  // The hifdh board reports where each student has reached rather than a
  // percentage of their target. classRows already worked the surah out, so
  // this is a lookup rather than another query.
  const surahOf = new Map(
    classRows.flatMap((r) => (r.surah ? [[r.name, r.surah.nameEn] as const] : [])),
  );
  const withSurah = (rows: { name: string; pct: number; rank: number }[]) =>
    rows.map((r) => ({ ...r, note: surahOf.get(r.name) }));

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const classAvg = mean(classRows.map((r) => r.hwAvg).filter((v): v is number => v !== null));
  const hifzAvg = mean(hifzRows.map((r) => Number(r.pct)));

  return (
    <>
      <header className="masthead">
        <h1>
          <span>Assalamu alaykum,</span>
          <br />
          <b>{profile.full_name.split(" ")[0]}.</b>
        </h1>
        <div className="meta">
          <span className="label">
            {myClass ? myClass.name : "No class assigned"} · Term {termId}
          </span>
          {pending.length > 0 && (
            <span className="label hi">
              {pending.length} waiting to be marked
            </span>
          )}
        </div>
      </header>

      <div className="divider">
        <span className="label">Needs my attention</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <div className="box c12">
          {pending.length ? (
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
      </div>

      <div className="divider">
        <span className="label">My class</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
          <StatTile label="Active students" value={roster.length || null} />
          <StatTile
            label={`Class homework avg · T${termId}`}
            value={classAvg === null ? null : `${classAvg.toFixed(1)}%`}
            sub="mean of each student's term average"
          />
          <StatTile
            label="Class hifdh avg"
            value={hifzAvg === null ? null : `${hifzAvg.toFixed(1)}%`}
            sub="mean of each student's % of target"
          />
      </div>

      {/* No roster / register buttons here: both are permanent items in the
          nav rail, so the pair only repeated navigation the teacher already
          has, directly under the list that links to every student anyway. */}
      <div className="field" style={{ marginTop: 1 }}>
        <div className="box c12">
          <ClassProgress rows={classRows} termId={termId} />
        </div>
      </div>

      <div className="divider">
        <span className="label">Leaderboards</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
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
            title="Hifdh"
            scopes={[
              ...(myClass
                ? [{
                    key: "class",
                    label: "My class",
                    rows: withSurah(leaderboards.hifz.mine),
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

      <div className="signoff">
        <span className="lines">{myClass ? myClass.name : "BSMS"}</span>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">Term {termId}</span>
      </div>
    </>
  );
}
