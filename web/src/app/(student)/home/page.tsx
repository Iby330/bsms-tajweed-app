import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  getTermsAndWeeks, currentWeek, currentTermId,
  getStudentProgress, getIndividualLeaderboard, getClassLeaderboards,
} from "@/lib/dashboard/queries";
import { expectedPassed } from "@/lib/hifz/pace";
import { StatTile } from "@/components/app/stat-tile";
import { PaceMarker } from "@/components/app/pace-marker";
import { StrikeDots } from "@/components/app/strike-dots";
import { LeaderboardWidget } from "@/components/app/leaderboard-widget";
import { CountdownChip } from "@/components/app/countdown-chip";
import { MixedText } from "@/components/app/mixed-text";
import { statusChip } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? null : `${n.toFixed(1)}%`);

export default async function StudentHome() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const now = new Date();

  const { terms, weeks } = await getTermsAndWeeks();
  const termId = currentTermId(terms, now);
  const week = currentWeek(weeks, now);

  const [progress, lbIndividual, lbClasses] = await Promise.all([
    getStudentProgress(profile.id, termId),
    getIndividualLeaderboard(),
    getClassLeaderboards(),
  ]);

  const { data: lessons } = week
    ? await db.from("lessons").select("id, title, series, youtube_id").eq("week_id", week.id).order("position")
    : { data: [] };
  const { data: watches } = await db
    .from("lesson_watches").select("lesson_id").eq("student_id", profile.id);
  const watched = new Set((watches ?? []).map((w) => w.lesson_id));

  const { data: hw } = week
    ? await db.from("homeworks").select("id, number, title, due_at").eq("week_id", week.id).maybeSingle()
    : { data: null };
  const { data: sub } = hw
    ? await db.from("submissions").select("status").eq("homework_id", hw.id).eq("student_id", profile.id).maybeSingle()
    : { data: null };

  const { data: released } = await db.from("homeworks").select("id", { count: "exact" });
  const { data: mine } = await db
    .from("submissions").select("id").eq("student_id", profile.id).eq("status", "approved");

  const expected = progress.hifz
    ? expectedPassed(now, weeks, progress.hifz.target)
    : 0;
  const chip = statusChip(sub?.status as never);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Assalamu alaykum, {profile.full_name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {week ? `Week ${week.number} · Term ${week.term_id}` : "The year hasn't started yet."}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">This week</h2>
        {lessons?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {lessons.map((l) => (
              <Link key={l.id} href={`/lessons/${l.id}`}
                className="group rounded-lg border border-line bg-card p-4 transition-colors hover:border-ink/30">
                <div className="flex items-start justify-between gap-3">
                  <MixedText text={l.title} className="text-sm font-medium leading-snug" />
                  {watched.has(l.id) && <span className="shrink-0 text-xs text-ok">watched ✓</span>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {l.series === "umm_al_kitab" ? "Umm al-Kitāb" : l.series === "tfp" ? "Ten Fundamental Principles" : "Tajweed"}
                  {!l.youtube_id && " · video coming soon"}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted-foreground">
            No lessons released yet.
          </p>
        )}

        {hw && (
          <Link href={`/homework/${hw.number}`}
            className="flex items-center justify-between rounded-lg border border-line bg-card p-4 transition-colors hover:border-ink/30">
            <div className="min-w-0">
              <div className="text-sm font-medium">Homework {hw.number}</div>
              <MixedText text={hw.title} className="text-xs text-muted-foreground" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                chip.tone === "ok" && "bg-ok/12 text-ok",
                chip.tone === "warn" && "bg-warn/12 text-warn",
                chip.tone === "ink" && "bg-muted text-foreground",
                chip.tone === "muted" && "bg-muted text-muted-foreground",
              )}>{chip.label}</span>
              {hw.due_at && sub?.status !== "approved" && <CountdownChip dueAt={hw.due_at} />}
            </div>
          </Link>
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
