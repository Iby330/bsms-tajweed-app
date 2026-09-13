import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { currentWeek, getTermsAndWeeks } from "@/lib/dashboard/queries";
import { homeworkScope, scopedHref } from "@/lib/teacher/scope";
import { ClassFilter } from "@/components/app/class-filter";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { Rule } from "@/components/app/rule";
import { moduleTitle, scheduledUnlockAt } from "@/lib/curriculum/tree";
import { getClassSchedule } from "@/lib/curriculum/queries";
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
  course_id: string | null;
  ordinal: number | null;
  number: number;
  title: string;
  series: string;
  is_graded: boolean;
};

const PENDING = ["submitted", "auto_marked"];

/**
 * The teacher's homework section.
 *
 * Opens on the teacher's own class and filters to any class in their section,
 * so covering for a colleague is a dropdown rather than a dead end.
 *
 * Three layers, most urgent first: this week's homework and its queue, a
 * backlog section that appears only when earlier weeks still have unmarked
 * work, and the whole year as folders — term ▸ course ▸ homeworks — so any
 * old homework is a couple of clicks from a mark edit.
 */
export default async function TeacherHomework({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>;
}) {
  const { class: classParam } = await searchParams;
  const db = await supabaseServer();

  // Only the submissions read needs the roster, so everything else goes first
  // and in parallel: the calendar is served from the reference cache, and the
  // homework list is fetched while the teacher's class is still being looked
  // up. That leaves three waves — class, roster, submissions — where the
  // roster genuinely cannot start before the class is known.
  const [scope, { terms, weeks }, { data: homeworks }] = await Promise.all([
    homeworkScope(classParam),
    getTermsAndWeeks(),
    db.from("homeworks")
      .select(`id, week_id, course_id, ordinal, number, title, series, is_graded`)
      .order("number"),
  ]);

  // The selected class's syllabus. Null when no single class is selected (the
  // section-wide view) or when the class has none — the sisters and the demo
  // cohorts — and in both cases the screen behaves exactly as it always has,
  // showing the whole programme.
  const schedule = await getClassSchedule(scope.selected?.id);

  const roster = scope.students;
  const rosterIds = roster.map((s) => s.id);
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));
  const href = (path: string) => scopedHref(scope, path);

  const { data: subs } = rosterIds.length
    ? await db.from("submissions")
        .select("id, status, is_late, homework_id, student_id")
        .in("student_id", rosterIds)
        .order("submitted_at")
    : { data: [] as Sub[] };

  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const week = currentWeek(weeks);

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


  /* ── What this class actually studies ──────────────────────────────────
   *
   * Under a syllabus, a homework belongs to the term THE CLASS takes its
   * course in, not the term its row is filed under — so Masjid An-Nabawi's
   * Mudūd appears in Term 1 where they study it, while every other class
   * keeps it in Term 3, off the same six rows. Homework for a course the
   * class does not take is dropped entirely, which is the whole point: they
   * were being offered eight Ghunna homeworks they are not studying.
   */
  const scheduledByCourse = new Map((schedule?.courses ?? []).map((c) => [c.courseId, c]));
  const useSyllabus = scheduledByCourse.size > 0;

  /** The group a homework is filed under: its course, or its series as before. */
  const groupKeyOf = (h: Hw) =>
    useSyllabus ? (h.course_id ? scheduledByCourse.get(h.course_id)?.key ?? null : null) : h.series;

  const termOf = (h: Hw) =>
    useSyllabus
      ? (h.course_id ? scheduledByCourse.get(h.course_id)?.termId : undefined)
      : weekById.get(h.week_id)?.term_id;

  /** When this homework opens for this class. */
  const unlockOf = (h: Hw): string | null => {
    const sc = useSyllabus && h.course_id ? scheduledByCourse.get(h.course_id) : undefined;
    if (schedule && sc) return scheduledUnlockAt(schedule, sc.termId, h.ordinal ?? 1);
    return weekById.get(h.week_id)?.unlock_at ?? null;
  };

  const visible = ((homeworks ?? []) as Hw[]).filter(
    (h) => !useSyllabus || groupKeyOf(h) !== null,
  );

  const labelOf = (key: string) =>
    (useSyllabus
      ? schedule?.courses.find((c) => c.key === key)?.label
      : SERIES_LABELS[key]) ?? SERIES_LABELS[key] ?? key;

  const rankOf = (key: string) =>
    useSyllabus
      ? schedule?.courses.find((c) => c.key === key)?.position ?? 0
      : seriesRank(key);

  // Released is now a fact about a HOMEWORK rather than about its week, since
  // the same row opens on different dates for different classes. The current
  // week's own unlock date is the reference point, which keeps this derived
  // from the calendar ordering rather than from a clock read a render is not
  // allowed to make.
  const nowRef = week ? Date.parse(week.unlock_at) : Number.NEGATIVE_INFINITY;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const releasedHwIds = new Set(
    visible.filter((h) => {
      const at = unlockOf(h);
      return at !== null && Date.parse(at) <= nowRef;
    }).map((h) => h.id),
  );
  /** Opening in the current teaching week — the reference point, up to the next. */
  const isThisWeek = (h: Hw) => {
    const at = unlockOf(h);
    if (at === null || !week) return false;
    const t = Date.parse(at);
    return t >= nowRef && t < nowRef + WEEK_MS;
  };

  const thisWeekHws = visible.filter(isThisWeek);
  const backlogHws = visible.filter((h) => !isThisWeek(h) && pendingByHw.has(h.id));

  // term → course (or series) → homeworks, in teaching order
  const byTerm = new Map<number, Map<string, Hw[]>>();
  for (const h of visible) {
    const termId = termOf(h);
    const group = groupKeyOf(h);
    if (termId === undefined || group === null) continue; // orphan or unscheduled
    let bySeries = byTerm.get(termId);
    if (!bySeries) byTerm.set(termId, (bySeries = new Map()));
    const list = bySeries.get(group) ?? [];
    list.push(h);
    bySeries.set(group, list);
  }

  // A course the class takes that has no homework in the app at all — Qāʿidah
  // Nūrāniyyah, Makhārij, the new Ṣifāt, and Umm al-Kitāb, which has nine
  // lessons and no homework. It gets an empty folder rather than vanishing:
  // Masjid Al-Aqsa's entire year is courses like these, and a blank screen
  // would read as the app being broken rather than as content not existing.
  if (useSyllabus) {
    for (const sc of scheduledByCourse.values()) {
      let bySeries = byTerm.get(sc.termId);
      if (!bySeries) byTerm.set(sc.termId, (bySeries = new Map()));
      if (!bySeries.has(sc.key)) bySeries.set(sc.key, []);
    }
  }

  const byWeekThenNumber = (a: Hw, b: Hw) => {
    const wa = a.ordinal ?? weekById.get(a.week_id)?.number ?? 0;
    const wb = b.ordinal ?? weekById.get(b.week_id)?.number ?? 0;
    return wa - wb || a.number - b.number;
  };
  const waitingIn = (list: Hw[]) =>
    list.reduce((n, h) => n + (pendingByHw.get(h.id)?.length ?? 0), 0);

  const queueRows = (list: Sub[]) => (
    <ul className="divide-y divide-line">
      {list.map((s) => (
        <li key={s.id}>
          <Link
            href={href(`/teacher/homework/submission/${s.id}`)}
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
    const unlocked = releasedHwIds.has(h.id);
    return (
      <li key={h.id}>
        <Link
          href={href(`/teacher/homework/${h.number}`)}
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

  /**
   * Courses in a term that the class takes but which have no homework at all.
   *
   * Named on the term's own row rather than left to be discovered inside it.
   * A term that reads "8 homeworks" while collapsed looks complete, and the
   * empty Umm al-Kitāb folder one click inside it looks like the app having
   * lost something — which is exactly how it was read the first time.
   */
  const emptyCoursesIn = (keys: string[], bySeries: Map<string, Hw[]>) =>
    keys.filter((k) => (bySeries.get(k) ?? []).length === 0).map(labelOf);

  const countLabel = (n: number, waiting: number, noneYet: string[] = []) => (
    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
      {waiting > 0 && <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn">{waiting} waiting</span>}
      <span>{n} homework{n === 1 ? "" : "s"}</span>
      {noneYet.length > 0 && (
        <span className="hidden sm:inline">
          · {noneYet.join(", ")} {noneYet.length === 1 ? "has" : "have"} none yet
        </span>
      )}
    </span>
  );

  return (
    <>
      <header className="masthead">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1><span>Homework</span></h1>
          <ClassFilter classes={scope.classes} selected={scope.selected?.id ?? null} own={scope.own} />
        </div>
        <p>
          {scope.label} · this week first, then anything still waiting, then the whole year.
        </p>
      </header>

      {/* No `space-y-*` on these sections: the utility overwrites the margins
          `.divider` sets, which is the whole vertical rhythm of the page. The
          panels take their spacing from `.field` instead — one hairline
          between them, like every other section in the app. */}
      <section>
        <Rule label={`This week${week ? ` · Week ${week.number}` : ""}`} />
        <div className="field">
        {thisWeekHws.length === 0 ? (
          <p className="box c12 note">
            No homework is set for this week.
          </p>
        ) : (
          thisWeekHws.map((h) => {
            const queue = pendingByHw.get(h.id) ?? [];
            const done = approvedByHw.get(h.id) ?? 0;
            return (
              <div key={h.id} className="box c12" style={{ padding: 0, gap: 0 }}>
                <Link
                  href={href(`/teacher/homework/${h.number}`)}
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
        </div>
      </section>

      {backlogHws.length > 0 && (
        <section>
          <Rule label="Still waiting from earlier weeks" />
          <div className="field">
            {backlogHws.map((h) => {
              const queue = pendingByHw.get(h.id) ?? [];
              return (
                <div key={h.id} className="box c12" style={{ padding: 0, gap: 0 }}>
                  <Link
                    href={href(`/teacher/homework/${h.number}`)}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3 transition-colors hover:bg-muted/60"
                  >
                    <span className="text-sm font-medium">{hwHeading(h)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-warn">{queue.length} waiting</span>
                  </Link>
                  {queueRows(queue)}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <Rule label="All homework" />
        <div className="field">
        {/* Folders, not pages. Only the current term starts open, and a term
            running a single course skips the middle folder — clicking through
            "Tajweed" to reach the only thing inside it is a step for nothing. */}
        {terms.map((term) => {
          const bySeries = byTerm.get(term.id);
          if (!bySeries) return null;
          const seriesKeys = [...bySeries.keys()].sort((a, b) => rankOf(a) - rankOf(b));
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
                        {labelOf(seriesKeys[0])}
                      </span>
                    )}
                  </span>
                </span>
                {countLabel(
                  termHws.length,
                  waitingIn(termHws),
                  emptyCoursesIn(seriesKeys, bySeries),
                )}
              </summary>

              {single && termHws.length === 0 ? (
                <p className="border-t border-line px-4 py-3 text-sm text-muted-foreground">
                  No homework for this course yet.
                </p>
              ) : single ? (
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
                            <span className="truncate">{labelOf(series)}</span>
                          </span>
                          {countLabel(list.length, waitingIn(list))}
                        </summary>
                        {list.length === 0 ? (
                          <p className="border-t border-line px-3 py-2.5 text-sm text-muted-foreground">
                            No homework for this course yet.
                          </p>
                        ) : (
                          <ul className="divide-y divide-line border-t border-line">
                            {list.map((h) => hwRow(h, true))}
                          </ul>
                        )}
                      </details>
                    );
                  })}
                </div>
              )}
            </details>
          );
        })}
        </div>
      </section>
    </>
  );
}
