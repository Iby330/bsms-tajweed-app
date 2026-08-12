import Link from "next/link";
import { currentProfile } from "@/lib/supabase/server";
import {
  currentWeek, currentTermId,
  getStudentProgress, getHomeLeaderboards,
} from "@/lib/dashboard/queries";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { listHomework, bucketHomework, moduleTitle, weekContent } from "@/lib/curriculum/tree";
import { expectedPassed } from "@/lib/hifz/pace";
import { StrikeDots } from "@/components/app/strike-dots";
import { LeaderboardPanel } from "@/components/app/leaderboard-panel";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { ProgressRing } from "@/components/app/progress-ring";
import { Sparkline } from "@/components/app/sparkline";
import { SegmentedCapsule, type Segment } from "@/components/app/segmented-capsule";
import { HifzArc } from "@/components/app/hifz-arc";
import { CountUp } from "@/components/app/count-up";
import { SERIES_LABELS, seriesShort } from "@/lib/lessons/series";
import { isLate } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StudentHome() {
  const profile = (await currentProfile())!;
  const now = new Date();

  // Two round trips for the whole screen. Nothing below is fetched: the
  // calendar, this week's lessons and homeworks, what has been watched and
  // what has been handed in all come out of the curriculum read, which had
  // already loaded every one of those rows to build the course tree. The
  // class NAME rides in on the profile, so the leaderboards no longer wait on
  // a lookup, and the progress figures come back keyed by term so they need
  // not wait on the calendar either.
  const [progress, leaderboards, curriculum] = await Promise.all([
    getStudentProgress(profile.id),
    getHomeLeaderboards(profile.classes?.name ?? null),
    getStudentCurriculum(profile.id, now),
  ]);

  const { terms, weeks } = curriculum.rows;
  const termId = currentTermId(terms, now);
  const week = currentWeek(weeks, now);

  // The cohort scope is the student's own section and only ever that — the
  // views filter on it in SQL, so this label describes what is shown rather
  // than choosing it.
  const cohortNoun = profile.section === "sisters" ? "sisters" : "brothers";
  const cohortLabel = `All ${cohortNoun}`;

  // A week can carry more than one course's homework — Term 3 week 1 has both
  // Tajweed 16 and TFP 1 — so `hws` is a list, not a single row.
  const { lessons, homeworks: hws } = week
    ? weekContent(curriculum.rows, week.id)
    : { lessons: [], homeworks: [] };
  const watched = curriculum.watchedLessonIds;
  const statusByHw = curriculum.submissionByHomeworkId;

  const hwAvg = progress.hwAvgByTerm[termId] ?? null;
  // Strikes reset each term, so only this term's count towards the three.
  const strikes = progress.strikes.filter((s) => s.term_id === termId);

  const allHomework = listHomework(curriculum.terms);

  // Overdue work from EARLIER weeks. "This week" alone hides it — a student can
  // be four homeworks behind and see a screen that says everything is fine.
  // Renders nothing when there's nothing overdue.
  const currentWeekHwIds = new Set(hws.map((h) => h.id));
  const buckets = bucketHomework(allHomework);
  const overdue = buckets.needsYou.filter(
    (e) => isLate(now, e.homework.due_at) && !currentWeekHwIds.has(e.homework.id),
  );

  // Counted against homework RELEASED SO FAR, not the year's 27. In week 3
  // "2 of 3" is a figure a student can act on; "2 of 27" reads like being 25
  // behind, which is just how far through the year they are.
  //
  // The numerator is everything handed IN — not just what a teacher has since
  // approved. With a whole-year denominator that distinction was invisible;
  // against a released-so-far one it matters, because a student who submitted
  // all three would otherwise read "1 of 3" as two missing.
  const releasedHomework = allHomework.filter((e) => e.unlocked);
  const handedIn = releasedHomework.filter(
    (e) => e.submission === "submitted" || e.submission === "auto_marked" || e.submission === "approved",
  ).length;

  // Every approved mark this year, newest first.
  const marks = buckets.marked
    .map((e) => curriculum.pctByHomeworkId.get(e.homework.id))
    .filter((v): v is number => typeof v === "number");

  // The last six, oldest → newest, for the trend line.
  const recentMarks = marks.slice(0, 6).reverse();

  // The whole year, not just this term. The ring answers "how am I doing
  // now"; this answers "how has the year gone" — and in an early term those
  // are very different numbers.
  const yearAvg = marks.length
    ? marks.reduce((total, m) => total + m, 0) / marks.length
    : null;

  // One capsule segment per homework released so far.
  const segments: Segment[] = releasedHomework.map((e) => {
    const isIn =
      e.submission === "submitted" ||
      e.submission === "auto_marked" ||
      e.submission === "approved";
    if (isIn) return "done";
    return isLate(now, e.homework.due_at) ? "overdue" : "pending";
  });

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
        <section className="glass anim-in rounded-2xl border-danger/30 bg-danger/10 p-4">
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
        {lessons.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {lessons.map((l) => {
              // No standalone homework cards here — the homework is linked from
              // the lesson itself. The video carries its course's deadline, since
              // watching is the first step towards handing in.
              const hw = hws.find((h) => h.series === l.series);
              const status = hw ? statusByHw.get(hw.id) : undefined;
              const handedIn =
                status === "submitted" || status === "auto_marked" || status === "approved";
              return (
                <Link key={l.id} href={`/lessons/${l.id}`}
                  className="glass glass-hover group anim-in rounded-2xl p-4">
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
          <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">
            No lessons released yet.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">My progress</h2>
          {/* Term % and End of year deliberately live on Progress, not here:
              both need the exam, so mid-term they are blank by construction. */}
          <Link
            href="/progress"
            className="text-xs text-ink-2 underline underline-offset-4 hover:text-foreground"
          >
            Term by term →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass glass-hover anim-in rounded-2xl p-4" style={{ animationDelay: "60ms" }}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Homework avg · T{termId}
            </div>
            {/* Three readings of the same subject, given equal room: where the
                term stands, which way it is moving, and where the year sits. */}
            <div className="mt-3 flex items-center justify-between gap-4">
              <ProgressRing value={hwAvg} tone="ok">
                <span className="font-heading text-sm">
                  <CountUp value={hwAvg} suffix="%" />
                </span>
              </ProgressRing>

              <div className="min-w-0 flex-1 text-center">
                {recentMarks.length >= 2 ? (
                  <>
                    <Sparkline values={recentMarks} className="mx-auto" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      last {recentMarks.length} marked
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {hwAvg === null
                      ? "no marks yet"
                      : "one mark so far — the trend appears at two"}
                  </p>
                )}
              </div>

              <div className="shrink-0 border-l border-line pl-4 text-right">
                <div className="font-heading text-xl">
                  <CountUp value={yearAvg} decimals={1} suffix="%" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  year to date
                </p>
              </div>
            </div>
          </div>

          <div className="glass glass-hover anim-in rounded-2xl p-4" style={{ animationDelay: "140ms" }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Submitted
              </span>
              <span className="font-heading text-lg tabular-nums">
                {handedIn}
                <span className="text-sm text-muted-foreground"> of {releasedHomework.length}</span>
              </span>
            </div>
            <div className="mt-3">
              <SegmentedCapsule segments={segments} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              one block per homework released so far
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">My hifz</h2>
          <div className="glass glass-hover anim-in rounded-2xl p-4" style={{ animationDelay: "220ms" }}>
            {progress.hifz ? (
              <>
                <HifzArc
                  passed={progress.hifz.passed}
                  expected={expected}
                  target={progress.hifz.target}
                />
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
          {/* The panel itself carries the warning: a clear term looks like every
              other panel, a struck term glows red before a word is read. */}
          <div
            className={cn(
              "glass glass-hover anim-in rounded-2xl p-4",
              strikes.length > 0 && "glass-danger border-danger/35",
            )}
            style={{ animationDelay: "300ms" }}
          >
            <StrikeDots strikes={strikes} />
            <p className="mt-3 text-xs text-muted-foreground">
              Strikes reset at the start of each term.
            </p>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">Leaderboards</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <LeaderboardPanel
            title="Homework"
            scopes={[
              {
                key: "class",
                label: "My class",
                rows: leaderboards.homework.mine,
                selfName: profile.full_name,
                noun: "in my class",
              },
              {
                key: "cohort",
                label: cohortLabel,
                rows: leaderboards.homework.cohort,
                selfName: profile.full_name,
                noun: cohortNoun,
              },
            ]}
          />
          <LeaderboardPanel
            title="Hifz"
            scopes={[
              {
                key: "class",
                label: "My class",
                rows: leaderboards.hifz.mine,
                selfName: profile.full_name,
                noun: "in my class",
              },
              {
                key: "classes",
                label: "All classes",
                rows: leaderboards.hifz.classes,
                // Rows are classes here, so "you" is the student's own class.
                selfName: leaderboards.myClass ?? "",
                noun: "classes",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
