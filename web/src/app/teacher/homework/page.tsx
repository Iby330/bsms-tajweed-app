import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { currentWeek } from "@/lib/dashboard/queries";
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

const PENDING = ["submitted", "auto_marked"];

/**
 * The teacher's homework section. Three layers, most urgent first:
 * this week's homework and its queue, a backlog section that only appears
 * when earlier weeks still have unmarked work, and the whole year laid out
 * term by term — the same shape as the student Courses screen — so any old
 * homework is two clicks from a mark edit.
 */
export default async function TeacherHomework() {
  const db = await supabaseServer();

  const [{ data: terms }, { data: weeks }, { data: homeworks }, { data: subs }] =
    await Promise.all([
      db.from("terms").select("id, starts_on, ends_on").order("id"),
      db.from("weeks").select("id, term_id, number, unlock_at").order("term_id").order("number"),
      db.from("homeworks").select("id, week_id, number, title, series, is_graded").order("number"),
      db.from("submissions").select("id, status, is_late, homework_id, student_id").order("submitted_at"),
    ]);

  const pending = (subs ?? []).filter((s) => PENDING.includes(s.status));
  const stuIds = [...new Set(pending.map((s) => s.student_id))];
  const [{ data: people }, { data: classes }] = await Promise.all([
    stuIds.length
      ? db.from("profiles").select("id, full_name, class_id").in("id", stuIds)
      : Promise.resolve({ data: [] }),
    db.from("classes").select("id, name"),
  ]);
  const personById = new Map((people ?? []).map((p) => [p.id, p]));
  const classById = new Map((classes ?? []).map((c) => [c.id, c.name]));

  const weekById = new Map((weeks ?? []).map((w) => [w.id, w]));
  const week = currentWeek(weeks ?? []);

  const pendingByHw = new Map<string, Sub[]>();
  for (const s of pending) {
    const list = pendingByHw.get(s.homework_id) ?? [];
    list.push(s);
    pendingByHw.set(s.homework_id, list);
  }
  const approvedByHw = new Map<string, number>();
  for (const s of subs ?? []) {
    if (s.status === "approved")
      approvedByHw.set(s.homework_id, (approvedByHw.get(s.homework_id) ?? 0) + 1);
  }

  const thisWeekHws = (homeworks ?? []).filter((h) => week && h.week_id === week.id);
  const backlogHws = (homeworks ?? []).filter(
    (h) => (!week || h.week_id !== week.id) && pendingByHw.has(h.id),
  );

  // term → series → homeworks, in teaching order
  const byTerm = new Map<number, Map<string, typeof thisWeekHws>>();
  for (const h of homeworks ?? []) {
    const termId = weekById.get(h.week_id)?.term_id;
    if (termId === undefined) continue; // orphan — its week was deleted
    let bySeries = byTerm.get(termId);
    if (!bySeries) byTerm.set(termId, (bySeries = new Map()));
    const list = bySeries.get(h.series) ?? [];
    list.push(h);
    bySeries.set(h.series, list);
  }

  const queueRows = (list: Sub[]) => (
    <ul className="divide-y divide-line">
      {list.map((s) => {
        const p = personById.get(s.student_id);
        return (
          <li key={s.id}>
            <Link
              href={`/teacher/homework/submission/${s.id}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="text-sm font-medium">{p?.full_name ?? "Student"}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {classById.get(p?.class_id ?? "") ?? ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                {s.is_late && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">late</span>}
                <span className="text-muted-foreground">
                  {s.status === "auto_marked" ? "marked, awaiting approval" : "not yet marked"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const hwHeading = (h: { number: number; series: string; title: string }) => {
    const title = moduleTitle(h.title);
    return (
      <>
        {homeworkLabel(h.number, h.series)}
        {title && <MixedText text={` · ${title}`} className="text-muted-foreground" />}
      </>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Homework</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This week first, then anything still waiting, then the whole year.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          This week{week ? ` · Week ${week.number}` : ""}
        </h2>
        {thisWeekHws.length === 0 ? (
          <p className="rounded-lg border border-line bg-card p-5 text-sm text-muted-foreground">
            No homework is set for this week.
          </p>
        ) : (
          thisWeekHws.map((h) => {
            const queue = pendingByHw.get(h.id) ?? [];
            const done = approvedByHw.get(h.id) ?? 0;
            return (
              <div key={h.id} className="overflow-hidden rounded-lg border border-line bg-card">
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
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Still waiting from earlier weeks
          </h2>
          {backlogHws.map((h) => {
            const queue = pendingByHw.get(h.id) ?? [];
            return (
              <div key={h.id} className="overflow-hidden rounded-lg border border-line bg-card">
                <Link
                  href={`/teacher/homework/${h.number}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <span className="text-sm font-medium">{hwHeading(h)}</span>
                  <span className="shrink-0 text-xs tabular-nums text-warn">
                    {queue.length} waiting
                  </span>
                </Link>
                {queueRows(queue)}
              </div>
            );
          })}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">All homework</h2>
        {/* Folders, not pages: term ▸ course ▸ homeworks, all native <details>.
            Only the current term starts open — the rest of the year is one
            click away without burying the screen in every homework at once. */}
        {(terms ?? []).map((term) => {
          const bySeries = byTerm.get(term.id);
          if (!bySeries) return null;
          const seriesKeys = [...bySeries.keys()].sort((a, b) => seriesRank(a) - seriesRank(b));
          const termHws = seriesKeys.flatMap((s) => bySeries.get(s) ?? []);
          const termWaiting = termHws.reduce((n, h) => n + (pendingByHw.get(h.id)?.length ?? 0), 0);
          return (
            <details
              key={term.id}
              open={week?.term_id === term.id}
              className="group/term overflow-hidden rounded-lg border border-line bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open/term:rotate-90">
                    ▸
                  </span>
                  Term {term.id}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  {termWaiting > 0 && (
                    <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">{termWaiting} waiting</span>
                  )}
                  <span>{termHws.length} homework{termHws.length === 1 ? "" : "s"}</span>
                </span>
              </summary>
              <div className="space-y-2 border-t border-line p-3">
                {seriesKeys.map((series) => {
                  const list = [...(bySeries.get(series) ?? [])].sort((a, b) => {
                    const wa = weekById.get(a.week_id)?.number ?? 0;
                    const wb = weekById.get(b.week_id)?.number ?? 0;
                    return wa - wb || a.number - b.number;
                  });
                  const seriesWaiting = list.reduce((n, h) => n + (pendingByHw.get(h.id)?.length ?? 0), 0);
                  return (
                    <details key={series} className="group/series overflow-hidden rounded-md border border-line bg-page">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2 text-sm">
                          <span aria-hidden className="text-xs text-muted-foreground transition-transform group-open/series:rotate-90">
                            ▸
                          </span>
                          {SERIES_LABELS[series] ?? series}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                          {seriesWaiting > 0 && (
                            <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">{seriesWaiting} waiting</span>
                          )}
                          <span>{list.length} homework{list.length === 1 ? "" : "s"}</span>
                        </span>
                      </summary>
                      <ul className="divide-y divide-line border-t border-line">
                        {list.map((h) => {
                          const waiting = pendingByHw.get(h.id)?.length ?? 0;
                          const done = approvedByHw.get(h.id) ?? 0;
                          const wk = weekById.get(h.week_id);
                          const unlocked = wk ? Date.parse(wk.unlock_at) <= Date.now() : true;
                          return (
                            <li key={h.id}>
                              <Link
                                href={`/teacher/homework/${h.number}`}
                                className={cn(
                                  "flex items-center justify-between gap-3 px-3 py-2.5 pl-8 transition-colors hover:bg-muted/60",
                                  !unlocked && "opacity-60",
                                )}
                              >
                                <span className="min-w-0 truncate text-sm">{hwHeading(h)}</span>
                                <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                                  {!h.is_graded && <span className="rounded bg-muted px-1.5 py-0.5">ungraded</span>}
                                  {!unlocked && <span>not released</span>}
                                  {waiting > 0 && (
                                    <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">
                                      {waiting} waiting
                                    </span>
                                  )}
                                  <span>{done} marked</span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </section>
    </div>
  );
}
