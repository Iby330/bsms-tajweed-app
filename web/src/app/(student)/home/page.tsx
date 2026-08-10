import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  getTermsAndWeeks, currentWeek, currentTermId,
  getStudentProgress, getIndividualLeaderboard, getClassLeaderboards,
} from "@/lib/dashboard/queries";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { listHomework, bucketHomework, moduleTitle } from "@/lib/curriculum/tree";
import { expectedPassed } from "@/lib/hifz/pace";
import { StatTile } from "@/components/app/stat-tile";
import { PaceMarker } from "@/components/app/pace-marker";
import { StrikeDots } from "@/components/app/strike-dots";
import { LeaderboardWidget } from "@/components/app/leaderboard-widget";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { SERIES_LABELS, seriesShort } from "@/lib/lessons/series";
import { isLate } from "@/lib/homework/logic";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? null : `${n.toFixed(1)}%`);

export default async function StudentHome() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const now = new Date();

  const { terms, weeks } = await getTermsAndWeeks();
  const termId = currentTermId(terms, now);
  const week = currentWeek(weeks, now);

  const [progress, lbIndividual, lbClasses, curriculum] = await Promise.all([
    getStudentProgress(profile.id, termId),
    getIndividualLeaderboard(),
    getClassLeaderboards(),
    getStudentCurriculum(profile.id, now),
  ]);

  const { data: lessons } = week
    ? await db.from("lessons").select("id, title, series, youtube_id").eq("week_id", week.id).order("position")
    : { data: [] };
  const { data: watches } = await db
    .from("lesson_watches").select("lesson_id").eq("student_id", profile.id);
  const watched = new Set((watches ?? []).map((w) => w.lesson_id));

  // A week can carry more than one course's homework — Term 3 week 1 has both
  // Tajweed 16 and TFP 1 — so this is a list, not a single row.
  const { data: hws } = week
    ? await db
        .from("homeworks")
        .select("id, number, title, series, due_at")
        .eq("week_id", week.id)
        .order("number")
    : { data: [] };
  const { data: weekSubs } = hws?.length
    ? await db
        .from("submissions")
        .select("homework_id, status")
        .eq("student_id", profile.id)
        .in("homework_id", hws.map((h) => h.id))
    : { data: [] };
  const statusByHw = new Map((weekSubs ?? []).map((s) => [s.homework_id, s.status]));

  const { data: released } = await db.from("homeworks").select("id", { count: "exact" });
  const { data: mine } = await db
    .from("submissions").select("id").eq("student_id", profile.id).eq("status", "approved");

  // Overdue work from EARLIER weeks. "This week" alone hides it — a student can
  // be four homeworks behind and see a screen that says everything is fine.
  // Renders nothing when there's nothing overdue.
  const currentWeekHwIds = new Set((hws ?? []).map((h) => h.id));
  const overdue = bucketHomework(listHomework(curriculum.terms)).needsYou.filter(
    (e) => isLate(now, e.homework.due_at) && !currentWeekHwIds.has(e.homework.id),
  );

  const expected = progress.hifz
    ? expectedPassed(now, weeks, progress.hifz.target)
    : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Assalamu alaykum, {profile.full_name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {week ? `Week ${week.number} · Term ${week.term_id}` : "The year hasn't started yet."}
        </p>
      </header>

      {overdue.length > 0 && (
        <section className="rounded-lg border border-danger/25 bg-danger/5 p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-danger">
            Overdue <span className="tabular-nums">({overdue.length})</span>
          </h2>
          <ul className="mt-2 space-y-1">
            {overdue.map((e) => (
              <li key={e.homework.id}>
                <Link
                  href={`/homework/${e.homework.number}?from=home`}
                  className="group flex items-baseline justify-between gap-3 rounded px-1 py-0.5 text-sm transition-colors hover:bg-danger/5"
                >
                  <span className="min-w-0">
                    <span className="font-medium group-hover:underline underline-offset-4">
                      {homeworkLabel(e.homework.number, e.series)}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {seriesShort(e.series)} · week {e.weekNumber}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-xs text-muted-foreground">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">This week</h2>
        {lessons?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {lessons.map((l) => {
              // No standalone homework cards here — the homework is linked from
              // the lesson itself. The video carries its course's deadline, since
              // watching is the first step towards handing in.
              const hw = (hws ?? []).find((h) => h.series === l.series);
              const status = hw ? statusByHw.get(hw.id) : undefined;
              const handedIn =
                status === "submitted" || status === "auto_marked" || status === "approved";
              return (
                <Link key={l.id} href={`/lessons/${l.id}`}
                  className="group rounded-lg border border-line bg-card p-4 transition-colors hover:border-ink/30">
                  <div className="flex items-start justify-between gap-3">
                    {/* cleaned title — the series label below already says the course;
                        TFP titles clean to "" so fall back to the raw one */}
                    <MixedText text={moduleTitle(l.title) || l.title} className="text-sm font-medium leading-snug" />
                    {watched.has(l.id) && <span className="shrink-0 text-xs text-ok">watched ✓</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {SERIES_LABELS[l.series] ?? l.series}
                      {!l.youtube_id && " · video coming soon"}
                    </p>
                    {hw?.due_at && !handedIn && <CountdownChip dueAt={hw.due_at} />}
                    {hw && handedIn && (
                      <span className="rounded-md bg-ok/12 px-2 py-0.5 text-xs font-medium text-ok">
                        homework in ✓
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted-foreground">
            No lessons released yet.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">My progress</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={`Homework avg · T${termId}`} value={pct(progress.hwAvg)} sub="marked homework only" />
          <StatTile label={`Term ${termId} %`} value={pct(progress.termPct)} sub="80% exam · 20% homework" />
          <StatTile label="End of year" value={pct(progress.eoyPct)} sub="mean of three terms" />
          <StatTile label="Submitted" value={`${mine?.length ?? 0} of ${released?.length ?? 0}`} sub="approved homework" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">My hifz</h2>
          <div className="rounded-lg border border-line bg-card p-4">
            {progress.hifz ? (
              <>
                <PaceMarker passed={progress.hifz.passed} expected={expected} target={progress.hifz.target} />
                <Link href="/hifz" className="mt-3 inline-block text-xs text-ink-2 underline underline-offset-4">
                  See every surah and teacher feedback →
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Your teacher hasn&apos;t set a hifz target yet.</p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Strikes</h2>
          <div className="rounded-lg border border-line bg-card p-4">
            <StrikeDots strikes={progress.strikes as never} />
            <p className="mt-2 text-xs text-muted-foreground">
              Three strikes in a term means leaving the course. They reset each term.
            </p>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Leaderboards</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <LeaderboardWidget title="Homework · me" rows={lbIndividual} selfName={profile.full_name} />
          <LeaderboardWidget title="Homework · my class" rows={lbClasses.homework} selfName={""} />
          <LeaderboardWidget title="Hifz · my class" rows={lbClasses.hifz} selfName={""} />
        </div>
      </section>
    </div>
  );
}
