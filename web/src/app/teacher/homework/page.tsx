import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { currentWeek, getTermsAndWeeks } from "@/lib/dashboard/queries";
import { scopeLabel, teacherRoster } from "@/lib/teacher/scope";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { moduleTitle } from "@/lib/curriculum/tree";
import { SERIES_LABELS, seriesRank } from "@/lib/lessons/series";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Sub = {
  id: string;
  status: string;
  is_late: boolean;
  homework_id: string;
  student_id: string;
};

type Hw = {
  id: string;
  week_id: string;
  number: number;
  title: string;
  series: string;
  is_graded: boolean;
};

const PENDING = ["submitted", "auto_marked"];

/**
 * The teacher's homework section, for their own class only.
 *
 * Three layers, most urgent first: this week's homework and its queue, a
 * backlog section that appears only when earlier weeks still have unmarked
 * work, and the whole year as folders — term ▸ course ▸ homeworks — so any
 * old homework is a couple of clicks from a mark edit.
 */
export default async function TeacherHomework() {
  const db = await supabaseServer();

  // Only the submissions read needs the roster, so everything else goes first
  // and in parallel: the calendar is served from the reference cache, and the
  // homework list is fetched while the teacher's class is still being looked
  // up. That leaves three waves — class, roster, submissions — where the
  // roster genuinely cannot start before the class is known.
  const [label, { terms, weeks }, { data: homeworks }] = await Promise.all([
    scopeLabel(),
    getTermsAndWeeks(),
    db.from("homeworks").select("id, week_id, number, title, series, is_graded").order("number"),
  ]);

  const roster = await teacherRoster();
  const rosterIds = roster.map((s) => s.id);
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));

  const { data: subs } = rosterIds.length
    ? await db.from("submissions")
        .select("id, status, is_late, homework_id, student_id")
        .in("student_id", rosterIds)
        .order("submitted_at")
    : { data: [] as Sub[] };

  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const week = currentWeek(weeks);

  // Weeks arrive in teaching order and unlock in that order, so everything up
  // to and including the current one is released. Derived from the ordering
  // rather than a clock read, which a render is not allowed to do.
  const orderedWeekIds = weeks.map((w) => w.id);
  const currentIndex = week ? orderedWeekIds.indexOf(week.id) : -1;
  const releasedWeekIds = new Set(orderedWeekIds.slice(0, currentIndex + 1));

  const pendingByHw = new Map<string, Sub[]>();
  const approvedByHw = new Map<string, number>();
  for (const s of (subs ?? []) as Sub[]) {
    if (PENDING.includes(s.status)) {
      const list = pendingByHw.get(s.homework_id) ?? [];
      list.push(s);
      pendingByHw.set(s.homework_id, list);
    } else if (s.status === "approved") {
      approvedByHw.set(s.homework_id, (approvedByHw.get(s.homework_id) ?? 0) + 1);
    }
  }

  const thisWeekHws = ((homeworks ?? []) as Hw[]).filter((h) => week && h.week_id === week.id);
  const backlogHws = ((homeworks ?? []) as Hw[]).filter(
    (h) => (!week || h.week_id !== week.id) && pendingByHw.has(h.id),
  );

  // term → series → homeworks, in teaching order
  const byTerm = new Map<number, Map<string, Hw[]>>();
  for (const h of (homeworks ?? []) as Hw[]) {
    const termId = weekById.get(h.week_id)?.term_id;
    if (termId === undefined) continue; // orphan — its week was deleted
    let bySeries = byTerm.get(termId);
    if (!bySeries) byTerm.set(termId, (bySeries = new Map()));
    const list = bySeries.get(h.series) ?? [];
    list.push(h);
    bySeries.set(h.series, list);
  }

  const byWeekThenNumber = (a: Hw, b: Hw) => {
    const wa = weekById.get(a.week_id)?.number ?? 0;
    const wb = weekById.get(b.week_id)?.number ?? 0;
    return wa - wb || a.number - b.number;
  };
  const waitingIn = (list: Hw[]) =>
    list.reduce((n, h) => n + (pendingByHw.get(h.id)?.length ?? 0), 0);

  const queueRows = (list: Sub[]) => (
    <ul className="divide-y divide-line">
      {list.map((s) => (
        <li key={s.id}>
          <Link
            href={`/teacher/homework/submission/${s.id}`}
            className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
          >
            <span className="min-w-0 truncate text-sm font-medium">
              {nameOf.get(s.student_id) ?? "Student"}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs">
              {s.is_late && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>}
              <span className="text-muted-foreground">
                {s.status === "auto_marked" ? "marked, awaiting approval" : "not yet marked"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  const hwHeading = (h: Hw) => {
    const title = moduleTitle(h.title);
    return (
      <>
        {homeworkLabel(h.number, h.series)}
        {title && <MixedText text={` · ${title}`} className="text-muted-foreground" />}
      </>
    );
  };

  /** One homework as a row in the year tree. */
  const hwRow = (h: Hw, indent: boolean) => {
    const waiting = pendingByHw.get(h.id)?.length ?? 0;
    const done = approvedByHw.get(h.id) ?? 0;
    const unlocked = releasedWeekIds.has(h.week_id);
    return (
      <li key={h.id}>
        <Link
          href={`/teacher/homework/${h.number}`}
          className={cn(
            "flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60",
            indent ? "pl-8" : "pl-4",
            !unlocked && "opacity-60",
          )}
        >
          <span className="min-w-0 truncate text-sm">{hwHeading(h)}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
            {!h.is_graded && <span className="rounded bg-muted px-1.5 py-0.5">ungraded</span>}
            {!unlocked && <span>not released</span>}
            {waiting > 0 && (
              <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">{waiting} waiting</span>
            )}
            <span>{done} marked</span>
          </span>
        </Link>
      </li>
    );
  };

  const countLabel = (n: number, waiting: number) => (
    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
      {waiting > 0 && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">{waiting} waiting</span>}
      <span>{n} homework{n === 1 ? "" : "s"}</span>
    </span>
  );

  return (
    <>
      <header className="masthead">
        <h1><span>Homework</span></h1>
        <p>
          {label} · this week first, then anything still waiting, then the whole year.
        </p>
      </header>

      <section className="space-y-3">
        <div className="divider">
          <span className="label">This week{week ? ` · Week ${week.number}` : ""}</span>
          <span className="r" />
          <span className="m" />
        </div>
        {thisWeekHws.length === 0 ? (
          <p className="box c12  p-5 text-sm text-muted-foreground">
            No homework is set for this week.
          </p>
        ) : (
          thisWeekHws.map((h) => {
            const queue = pendingByHw.get(h.id) ?? [];
            const done = approvedByHw.get(h.id) ?? 0;
            return (
              <div key={h.id} className="box c12" style={{ padding: 0, gap: 0 }}>
                <Link
                  href={`/teacher/homework/${h.number}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <span className="text-sm font-medium">{hwHeading(h)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {done} marked{queue.length ? ` · ${queue.length} waiting` : " · all caught up"}
                  </span>
                </Link>
                {queue.length > 0 ? (
                  queueRows(queue)
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Nothing waiting for review.
                  </p>
                )}
              </div>
            );
          })
        )}
      </section>

      {backlogHws.length > 0 && (
        <section className="space-y-3">
          <div className="divider">
          <span className="label">Still waiting from earlier weeks</span>
          <span className="r" />
          <span className="m" />
        </div>
          {backlogHws.map((h) => {
            const queue = pendingByHw.get(h.id) ?? [];
            return (
              <div key={h.id} className="box c12" style={{ padding: 0, gap: 0 }}>
                <Link
                  href={`/teacher/homework/${h.number}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <span className="text-sm font-medium">{hwHeading(h)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-warn">{queue.length} waiting</span>
                </Link>
                {queueRows(queue)}
              </div>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <div className="divider">
          <span className="label">All homework</span>
          <span className="r" />
          <span className="m" />
        </div>
        {/* Folders, not pages. Only the current term starts open, and a term
            running a single course skips the middle folder — clicking through
            "Tajweed" to reach the only thing inside it is a step for nothing. */}
        {terms.map((term) => {
          const bySeries = byTerm.get(term.id);
          if (!bySeries) return null;
          const seriesKeys = [...bySeries.keys()].sort((a, b) => seriesRank(a) - seriesRank(b));
          const termHws = seriesKeys.flatMap((s) => bySeries.get(s) ?? []);
          const single = seriesKeys.length === 1;

          return (
            <details
              key={term.id}
              open={week?.term_id === term.id}
              className="folder group/term box c12" style={{ padding: 0, gap: 0 }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className="text-xs text-muted-foreground transition-transform duration-200 group-open/term:rotate-90"
                  >
                    ▸
                  </span>
                  <span className="truncate">
                    Term {term.id}
                    {single && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {SERIES_LABELS[seriesKeys[0]] ?? seriesKeys[0]}
                      </span>
                    )}
                  </span>
                </span>
                {countLabel(termHws.length, waitingIn(termHws))}
              </summary>

              {single ? (
                <ul className="divide-y divide-line border-t border-line">
                  {[...termHws].sort(byWeekThenNumber).map((h) => hwRow(h, false))}
                </ul>
              ) : (
                <div className="space-y-2 border-t border-line p-3">
                  {seriesKeys.map((series) => {
                    const list = [...(bySeries.get(series) ?? [])].sort(byWeekThenNumber);
                    return (
                      <details
                        key={series}
                        className="folder group/series overflow-hidden rounded-md border border-line bg-page"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                          <span className="flex min-w-0 items-center gap-2 text-sm">
                            <span
                              aria-hidden
                              className="text-xs text-muted-foreground transition-transform duration-200 group-open/series:rotate-90"
                            >
                              ▸
                            </span>
                            <span className="truncate">{SERIES_LABELS[series] ?? series}</span>
                          </span>
                          {countLabel(list.length, waitingIn(list))}
                        </summary>
                        <ul className="divide-y divide-line border-t border-line">
                          {list.map((h) => hwRow(h, true))}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              )}
            </details>
          );
        })}
      </section>
    </>
  );
}
