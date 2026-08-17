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
import { Sparkline } from "@/components/app/sparkline";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList } from "@/lib/hifz/pace";
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
  const cohortNoun =
    profile.section === "sisters" ? "sisters"
    : profile.section === "demo" ? "demo classes"
    : "brothers";
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

  // One block per homework released so far, each carrying enough to name
  // itself on hover: twenty marks in a strip are unreadable otherwise.
  const blocks = releasedHomework.map((e) => {
    const isIn =
      e.submission === "submitted" ||
      e.submission === "auto_marked" ||
      e.submission === "approved";
    const pct = curriculum.pctByHomeworkId.get(e.homework.id) ?? null;
    return {
      id: e.homework.id,
      state: isIn ? ("done" as const) : isLate(now, e.homework.due_at) ? ("late" as const) : ("pending" as const),
      label: homeworkLabel(e.homework.number, e.series),
      week: e.weekNumber,
      series: seriesShort(e.series),
      pct,
    };
  });

  // The surah just passed, for the Arabic line. Reference data, so this is
  // a cache read rather than a query.
  const surahs = progress.hifz ? await getCachedSurahs() : [];
  const hifzList = progress.hifz
    ? memorisationList(progress.hifz.startSurah, progress.hifz.target, surahs)
    : [];
  const lastPassed =
    progress.hifz && progress.hifz.passed > 0
      ? hifzList[progress.hifz.passed - 1] ?? null
      : null;

  const expected = progress.hifz
    ? expectedPassed(now, weeks, progress.hifz.target)
    : 0;

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
            {week ? `Week ${week.number} · Term ${week.term_id}` : "The year hasn\u2019t started yet"}
            {profile.classes?.name ? ` · ${profile.classes.name}` : ""}
          </span>
          {overdue.length > 0 && (
            <span className="label hi">
              {overdue.length === 1 ? "One thing needs you" : `${overdue.length} things need you`}
            </span>
          )}
        </div>
      </header>

      {overdue.length > 0 && (
        <div className="field see-through">
          <section className="box c12 needs">
            <div className="flex items-baseline justify-between gap-4">
              <span className="label" style={{ color: "var(--danger)" }}>Overdue</span>
              <span className="label tabular-nums" style={{ color: "var(--danger)" }}>
                {String(overdue.length).padStart(2, "0")}
              </span>
            </div>
            <ul className="rowlist">
              {overdue.map((e) => (
                <li key={e.homework.id} className="linked">
                  {/* The whole row is the link. An "Open" chip alongside it
                      was a second control for the one thing the row already
                      does, and it made the rest of the row look inert. */}
                  <Link href={`/homework/${e.homework.number}?from=home`} className="rowlink">
                    <span className="t">{homeworkLabel(e.homework.number, e.series)}</span>
                    <span className="meta">
                      <span className="s bad">
                        {seriesShort(e.series)} · week {e.weekNumber}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <div className="divider">
        <span className="label">This week</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        {lessons.length ? (
          lessons.map((l, i) => {
            // No standalone homework cards: the homework is reached from the
            // lesson, since watching is the first step to handing in.
            const hw = hws.find((h) => h.series === l.series);
            const status = hw ? statusByHw.get(hw.id) : undefined;
            const isIn =
              status === "submitted" || status === "auto_marked" || status === "approved";
            // Two to a row. An odd one out spans the full twelve rather than
            // leaving half a row of bare border colour beside it.
            const odd = lessons.length % 2 === 1 && i === lessons.length - 1;
            return (
              <Link
                key={l.id}
                href={`/lessons/${l.id}`}
                className={cn("box lesson", odd ? "c12" : "c6")}
              >
                <span className="label">{SERIES_LABELS[l.series] ?? l.series}</span>
                <MixedText text={moduleTitle(l.title) || l.title} className="t" />
                <span className="foot">
                  <span className={cn("s", watched.has(l.id) && "on")}>
                    {watched.has(l.id)
                      ? "Watched"
                      : l.youtube_id
                        ? "Not watched yet"
                        : "Video coming soon"}
                  </span>
                  {hw?.due_at && !isIn ? (
                    <CountdownChip dueAt={hw.due_at} />
                  ) : hw && isIn ? (
                    <span className="chip ok">Homework in ✓</span>
                  ) : null}
                </span>
              </Link>
            );
          })
        ) : (
          <section className="box c12">
            <div className="note">No lessons released yet.</div>
          </section>
        )}
      </div>

      <div className="divider">
        <span className="label">Where you stand</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <section className="box c7">
          <span className="label">Homework average · Term {termId}</span>
          <div className="stat">
            <span className="v">{hwAvg === null ? "\u2014" : Math.round(hwAvg)}</span>
            {hwAvg !== null && <span className="u">%</span>}
          </div>
          {recentMarks.length >= 2 ? (
            <>
              <Sparkline values={recentMarks} />
              <div className="note">
                Last {recentMarks.length} marked
                {yearAvg !== null && (
                  <> · <span className="trend">year average {Math.round(yearAvg)}%</span></>
                )}
              </div>
            </>
          ) : (
            <div className="note">
              {hwAvg === null ? "No marks yet." : "One mark so far. The trend appears at two."}
            </div>
          )}
        </section>

        <section className="box c5">
          <span className="label">Handed in</span>
          <div className="stat">
            <span className="v sm">{handedIn}</span>
            <span className="u">of {releasedHomework.length} released</span>
          </div>
          <div className="caps" role="img"
               aria-label={`${handedIn} of ${releasedHomework.length} homeworks handed in`}>
            {blocks.map((b) => (
              <i
                key={b.id}
                tabIndex={0}
                className={b.state === "pending" ? undefined : b.state}
                data-tip={b.label}
                data-tip-meta={`${b.series} · week ${b.week}`}
                data-tip-value={
                  b.pct !== null
                    ? `Marked ${b.pct.toFixed(1)}%`
                    : b.state === "done"
                      ? "Handed in · not marked yet"
                      : b.state === "late"
                        ? "Not handed in · overdue"
                        : "Not handed in yet"
                }
              />
            ))}
          </div>
          <div className="note">One block per homework released so far.</div>
        </section>

        <section className="box c8">
          <span className="label">Hifdh</span>
          {progress.hifz ? (
            <>
              {lastPassed && (
                <div className="surah-line">
                  <span className="ar">{lastPassed.name_ar}</span>
                  <span className="note">Last passed · {lastPassed.name_en}</span>
                </div>
              )}
              <div className="beads" role="img"
                   aria-label={`${progress.hifz.passed} of ${progress.hifz.target} surahs passed`}>
                {Array.from({ length: progress.hifz.target }, (_, i) => {
                  const s = hifzList[i];
                  const done = i < progress.hifz!.passed;
                  return (
                    <b
                      key={i}
                      tabIndex={0}
                      className={cn(done && "done", i === expected - 1 && "pace")}
                      data-tip={s ? `${i + 1}. Sūrah ${s.name_en}` : `Surah ${i + 1}`}
                      data-tip-ar={s?.name_ar}
                      data-tip-meta={done ? "Passed" : "Not yet passed"}
                      data-tip-value={i === expected - 1 ? "Where you are expected to be" : undefined}
                    />
                  );
                })}
              </div>
              <div className="note">
                {progress.hifz.passed} of {progress.hifz.target}
                {expected > 0 && (
                  <> · <span className="trend">
                    {progress.hifz.passed > expected
                      ? `${progress.hifz.passed - expected} ahead of pace`
                      : progress.hifz.passed < expected
                        ? `${expected - progress.hifz.passed} behind pace`
                        : "on pace"}
                  </span></>
                )}
              </div>
              <Link href="/hifz" className="note underline underline-offset-4">
                Every surah and your teacher&rsquo;s feedback →
              </Link>
            </>
          ) : (
            <div className="note">Your teacher hasn&rsquo;t set a hifdh target yet.</div>
          )}
        </section>

        <StrikeDots strikes={strikes} />
      </div>

      <div className="divider">
        <span className="label">Your class</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <LeaderboardPanel
          title="Homework"
          scopes={[
            { key: "class", label: "My class", rows: leaderboards.homework.mine,
              selfName: profile.full_name, noun: "in my class" },
            { key: "cohort", label: cohortLabel, rows: leaderboards.homework.cohort,
              selfName: profile.full_name, noun: cohortNoun },
          ]}
        />
        <LeaderboardPanel
          title="Hifdh"
          scopes={[
            { key: "class", label: "My class", rows: leaderboards.hifz.mine,
              selfName: profile.full_name, noun: "in my class" },
            { key: "classes", label: "All classes", rows: leaderboards.hifz.classes,
              // Rows are classes here, so "you" is the student's own class.
              selfName: leaderboards.myClass ?? "", noun: "classes" },
          ]}
        />
      </div>

      <div className="signoff">
        <span className="lines">{profile.classes?.name ?? "BSMS"}</span>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">Term {termId}</span>
      </div>
    </>
  );
}
