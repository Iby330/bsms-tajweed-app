import Link from "next/link";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { currentWeek, getTermsAndWeeks, weekEndsAt } from "@/lib/dashboard/queries";
import { homeworkScope, scopedHref } from "@/lib/teacher/scope";
import { HW_VIEW_COOKIE, pickHwView, requestTime } from "@/lib/teacher/homework-view";
import { getCachedSectionWeeks } from "@/lib/reference/cached";
import { sectionWeekRows } from "@/lib/curriculum/section-weeks";
import { ClassFilter } from "@/components/app/class-filter";
import { HomeworkViewToggle, HomeworkWeekTabs, type WeekTab } from "@/components/app/homework-views";
import { MixedText } from "@/components/app/mixed-text";
import { homeworkLabel } from "@/components/app/homework-row";
import { Rule } from "@/components/app/rule";
import { moduleTitle, scheduledDueAt, scheduledUnlockAt } from "@/lib/curriculum/tree";
import { getClassSchedule } from "@/lib/curriculum/queries";
import { SERIES_LABELS, seriesRank } from "@/lib/lessons/series";
import { fmtStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Sub = {
  id: string;
  status: string;
  is_late: boolean;
  homework_id: string;
  student_id: string;
};

/** Where one student stands on one homework, as the table draws it. */
type CellState = "marked" | "to_mark" | "to_approve" | "sent_back" | "missed" | "not_yet";

type Hw = {
  id: string;
  week_id: string;
  course_id: string | null;
  ordinal: number | null;
  number: number;
  title: string;
  series: string;
  is_graded: boolean;
  due_at: string | null;
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
  searchParams: Promise<{ class?: string; view?: string }>;
}) {
  const { class: classParam, view: viewParam } = await searchParams;
  const db = await supabaseServer();
  const view = pickHwView(viewParam, (await cookies()).get(HW_VIEW_COOKIE)?.value);

  // Only the submissions read needs the roster, so everything else goes first
  // and in parallel: the calendar is served from the reference cache, and the
  // homework list is fetched while the teacher's class is still being looked
  // up. That leaves three waves — class, roster, submissions — where the
  // roster genuinely cannot start before the class is known.
  const [scope, { terms, weeksFor }, { data: homeworks }, sectionWeeks] = await Promise.all([
    homeworkScope(classParam),
    getTermsAndWeeks(),
    db.from("homeworks")
      .select(`id, week_id, course_id, ordinal, number, title, series, is_graded, due_at`)
      .order("number"),
    getCachedSectionWeeks(),
  ]);

  // The selected class's syllabus. Null when no single class is selected (the
  // section-wide view) or when the class has none — the sisters and the demo
  // cohorts — and in both cases the screen behaves exactly as it always has,
  // showing the whole programme.
  const schedule = await getClassSchedule(scope.selected?.id);

  // The section's own calendar (0052): the selected class's, else the one
  // section every class in the filter shares. A sisters' week opens Wednesday.
  const section = scope.selected?.section ?? scope.classes[0]?.section;
  const weeks = weeksFor(section);

  const roster = scope.students;
  const rosterIds = roster.map((s) => s.id);
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));
  const href = (path: string) => scopedHref(scope, path);

  // Every handed-in script for the roster across the whole year, which a
  // single read cut at 1000 rows — oldest first, so this week's queue was what
  // went missing. Drafts are left in the database: nothing here counts them.
  //
  // Alongside it, the two things the table needs to tell "not handed in yet"
  // from "missed" and from "sent back": each student's extensions, and the
  // reopened drafts of scripts a teacher returned for a redo.
  const [subs, extensions, redos]: [
    Sub[],
    { homework_id: string; student_id: string; due_at: string }[],
    { homework_id: string; student_id: string }[],
  ] = rosterIds.length
    ? await Promise.all([
        readAll((from, to) =>
          db.from("submissions")
            .select("id, status, is_late, homework_id, student_id")
            .in("student_id", rosterIds)
            .neq("status", "draft")
            .order("submitted_at")
            .order("id")
            .range(from, to),
        ),
        readAll((from, to) =>
          db.from("homework_extensions")
            .select("homework_id, student_id, due_at")
            .in("student_id", rosterIds)
            .order("homework_id")
            .order("student_id")
            .range(from, to),
        ),
        readAll((from, to) =>
          db.from("submissions")
            .select("homework_id, student_id")
            .in("student_id", rosterIds)
            .eq("status", "draft")
            .gt("attempt", 1)
            .order("id")
            .range(from, to),
        ),
      ])
    : [[], [], []];

  const weekById = new Map(weeks.map((w) => [w.id, w]));
  const week = currentWeek(weeks);

  const pendingByHw = new Map<string, Sub[]>();
  const approvedByHw = new Map<string, number>();
  for (const s of subs) {
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
    if (schedule && sc) return scheduledUnlockAt(schedule, sc.termId, h.ordinal ?? 1, sc.courseId);
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
  const weekEnd = week ? weekEndsAt(weeks, week) : Number.NEGATIVE_INFINITY;
  const releasedHwIds = new Set(
    visible.filter((h) => {
      const at = unlockOf(h);
      return at !== null && Date.parse(at) <= nowRef;
    }).map((h) => h.id),
  );
  /** Opening in the current teaching week — the reference point, up to the
   *  next week's opening (not a fixed seven days: week 1 was shorter). */
  const isThisWeek = (h: Hw) => {
    const at = unlockOf(h);
    if (at === null || !week) return false;
    const t = Date.parse(at);
    return t >= nowRef && t < weekEnd;
  };

  const byNumber = (a: Hw, b: Hw) => a.number - b.number;
  const thisWeekHws = visible.filter(isThisWeek).sort(byNumber);

  /* ── Earlier weeks ─────────────────────────────────────────────────────
   *
   * Every released homework filed under the teaching week it opened in for
   * this class. The newest of those weeks is "last week" and is shown whole,
   * marked or not; anything older only while it still has scripts to mark.
   * A homework whose opening falls outside the calendar is filed under no
   * week, and still surfaces as backlog if it has work waiting.
   */
  const weekSpans = weeks.map((w) => ({ w, from: Date.parse(w.unlock_at), to: weekEndsAt(weeks, w) }));
  const weekOf = (h: Hw) => {
    const at = unlockOf(h);
    if (at === null) return null;
    const t = Date.parse(at);
    return weekSpans.find((x) => t >= x.from && t < x.to)?.w ?? null;
  };
  const earlierByWeek = new Map<string, Hw[]>();
  const unfiled: Hw[] = [];
  for (const h of visible) {
    if (!releasedHwIds.has(h.id) || isThisWeek(h)) continue;
    const w = weekOf(h);
    if (!w) {
      unfiled.push(h);
      continue;
    }
    const list = earlierByWeek.get(w.id) ?? [];
    list.push(h);
    earlierByWeek.set(w.id, list);
  }
  for (const list of earlierByWeek.values()) list.sort(byNumber);
  // newest first
  const earlierWeeks = weeks
    .filter((w) => earlierByWeek.has(w.id))
    .sort((a, b) => Date.parse(b.unlock_at) - Date.parse(a.unlock_at));
  const lastWeek = earlierWeeks[0] ?? null;
  const lastWeekHws = lastWeek ? earlierByWeek.get(lastWeek.id) ?? [] : [];
  const lastWeekIds = new Set(lastWeekHws.map((h) => h.id));
  const backlogHws = visible.filter(
    (h) => !isThisWeek(h) && !lastWeekIds.has(h.id) && pendingByHw.has(h.id),
  );

  /** "Week 4", with its term when that is not the term in progress. */
  const weekName = (w: { number: number; term_id: number }) =>
    week && w.term_id !== week.term_id ? `Term ${w.term_id} · Week ${w.number}` : `Week ${w.number}`;

  /* ── Where each student stands on each homework ────────────────────────
   *
   * A deadline as `homework_due_for` stamps it: the student's extension, else
   * the class's syllabus week, else the section's week, else the row's own.
   * "Missed" is judged against the time of this request, not the opening of
   * the current week: a deadline can fall after the next week opens (week 1's
   * did, by six hours), and against the week it would never turn red.
   */
  const keyOf = (homeworkId: string, studentId: string) => `${homeworkId}:${studentId}`;
  const subByKey = new Map(subs.map((s) => [keyOf(s.homework_id, s.student_id), s]));
  const redoKeys = new Set(redos.map((r) => keyOf(r.homework_id, r.student_id)));
  const extensionDue = new Map(extensions.map((e) => [keyOf(e.homework_id, e.student_id), e.due_at]));
  const sectionDue = sectionWeekRows(sectionWeeks, section);

  const classDueOf = (h: Hw): string | null => {
    const sc = useSyllabus && h.course_id ? scheduledByCourse.get(h.course_id) : undefined;
    const fromSchedule = schedule && sc ? scheduledDueAt(schedule, sc.termId, h.ordinal ?? 1, sc.courseId) : null;
    return fromSchedule ?? sectionDue.get(h.week_id)?.due_at ?? h.due_at;
  };
  const asOf = requestTime();
  const isPast = (iso: string | null) => iso !== null && Date.parse(iso) <= asOf;

  const cellOf = (h: Hw, studentId: string): { state: CellState; sub?: Sub } => {
    const key = keyOf(h.id, studentId);
    const sub = subByKey.get(key);
    if (sub) {
      return {
        state: sub.status === "approved" ? "marked" : sub.status === "auto_marked" ? "to_approve" : "to_mark",
        sub,
      };
    }
    if (redoKeys.has(key)) return { state: "sent_back" };
    return { state: isPast(extensionDue.get(key) ?? classDueOf(h)) ? "missed" : "not_yet" };
  };

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

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  const check = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
  const lateTag = <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-warn">late</span>;

  const queueRows = (list: Sub[]) => (
    <ul>
      {list.map((s) => {
        const name = nameOf.get(s.student_id) ?? "Student";
        return (
          <li key={s.id} className="border-t border-line first:border-t-0 even:bg-muted/40">
            <Link
              href={href(`/teacher/homework/submission/${s.id}`)}
              className="flex items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-muted sm:px-5"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-muted-foreground"
                >
                  {initials(name)}
                </span>
                <span className="min-w-0 truncate text-sm font-medium">{name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {s.is_late && lateTag}
                {s.status === "auto_marked" ? (
                  <span className="rounded-full bg-brand/12 px-2.5 py-1 text-xs font-semibold text-brand">
                    Awaiting approval
                  </span>
                ) : (
                  <span className="rounded-full bg-warn/12 px-2.5 py-1 text-xs font-semibold text-warn">
                    Not yet marked
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  /**
   * One homework in the list view: a navy heading that carries the count, the
   * scripts waiting under it, and — once its deadline has passed — who never
   * handed it in. A homework with nothing waiting is its heading alone.
   */
  const hwCard = (h: Hw) => {
    const queue = pendingByHw.get(h.id) ?? [];
    const done = approvedByHw.get(h.id) ?? 0;
    const handedIn = done + queue.length;
    const missed = roster.filter((s) => cellOf(h, s.id).state === "missed").map((s) => s.full_name);
    const title = moduleTitle(h.title);
    const label = homeworkLabel(h.number, h.series);
    return (
      <div key={h.id} className="border border-line bg-card">
        <Link
          href={href(`/teacher/homework/${h.number}`)}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-primary px-4 py-3 text-primary-foreground transition-opacity hover:opacity-90 sm:px-5"
        >
          {title ? (
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-75">{label}</span>
              <MixedText text={title} className="text-base font-semibold leading-snug" />
            </span>
          ) : (
            <span className="text-base font-semibold">{label}</span>
          )}
          <span className="flex flex-wrap items-center gap-2.5 text-xs tabular-nums">
            {queue.length > 0 ? (
              <>
                <span className="opacity-80">{done} of {handedIn} marked</span>
                <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-warn">{queue.length} waiting</span>
              </>
            ) : handedIn > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 font-semibold text-ok">
                {check}All caught up · {done} marked
              </span>
            ) : (
              <span className="rounded-full bg-card px-2.5 py-1 font-semibold text-muted-foreground">Nothing handed in yet</span>
            )}
          </span>
        </Link>
        {queue.length > 0 && (
          <>
            <div aria-hidden className="h-1 bg-warn/15">
              <div className="h-full bg-ok" style={{ width: `${Math.round((done / handedIn) * 100)}%` }} />
            </div>
            {queueRows(queue)}
          </>
        )}
        {missed.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 text-sm sm:px-5">
            <span className="rounded-full bg-danger/12 px-2.5 py-0.5 text-xs font-semibold text-danger">Missed</span>
            <span className="text-muted-foreground">{missed.join(", ")}</span>
          </p>
        )}
      </div>
    );
  };

  const cards = (list: Hw[]) => <div className="flex flex-col gap-4">{list.map(hwCard)}</div>;

  /* ── The table view: every student against every homework of one week ── */

  const individualHref = (h: Hw, studentId: string) =>
    href(`/teacher/homework/${h.number}?tab=individual&student=${studentId}`);

  const pill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold";

  const cellChip = (h: Hw, studentId: string) => {
    const { state, sub } = cellOf(h, studentId);
    const script = sub ? href(`/teacher/homework/submission/${sub.id}`) : individualHref(h, studentId);
    const chip =
      state === "marked" ? (
        <Link href={script} className={cn(pill, "bg-ok/12 text-ok hover:bg-ok/20")}>{check}Marked</Link>
      ) : state === "to_mark" ? (
        <Link href={script} className={cn(pill, "bg-warn/12 text-warn hover:bg-warn/20")}>
          <span aria-hidden className="size-1.5 rounded-full bg-warn" />To mark
        </Link>
      ) : state === "to_approve" ? (
        <Link href={script} className={cn(pill, "bg-brand/12 text-brand hover:bg-brand/20")}>To approve</Link>
      ) : state === "sent_back" ? (
        <Link href={script} className={cn(pill, "bg-muted text-muted-foreground hover:bg-accent")}>Sent back</Link>
      ) : state === "missed" ? (
        <Link href={script} className={cn(pill, "bg-danger/12 text-danger hover:bg-danger/20")}>Missed</Link>
      ) : (
        <span className="text-xs text-muted-foreground">Not handed in yet</span>
      );
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {chip}
        {sub?.is_late && lateTag}
      </span>
    );
  };

  // Opaque, so the sticky name column hides what scrolls beneath it.
  const zebra = "bg-[color-mix(in_oklab,var(--muted)_45%,var(--card))]";

  const weekGrid = (list: Hw[]) =>
    list.length === 0 ? (
      <p className="border border-line bg-card px-4 py-3 text-sm text-muted-foreground">
        No homework is set for this week.
      </p>
    ) : roster.length === 0 ? (
      <p className="border border-line bg-card px-4 py-3 text-sm text-muted-foreground">
        No students in this class yet.
      </p>
    ) : (
      <div className="overflow-x-auto border border-line bg-card">
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${11 + list.length * 9}rem` }}>
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-primary px-4 py-3 text-left align-bottom font-mono text-[11px] font-normal uppercase tracking-[0.15em] opacity-90"
              >
                Student
              </th>
              {list.map((h) => {
                const title = moduleTitle(h.title);
                const due = classDueOf(h);
                return (
                  <th key={h.id} scope="col" className="border-l border-primary-foreground/15 p-0 text-left align-top font-normal">
                    <Link href={href(`/teacher/homework/${h.number}`)} className="flex flex-col gap-1 px-3 py-3 hover:underline">
                      <span className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-75">
                        {homeworkLabel(h.number, h.series)}
                      </span>
                      {title && <MixedText text={title} className="text-[13px] font-semibold leading-snug" />}
                      {due && (
                        <span className="text-[11px] opacity-75">
                          {isPast(due) ? "Deadline passed" : `Due ${fmtStamp(due)}`}
                        </span>
                      )}
                    </Link>
                  </th>
                );
              })}
            </tr>
            <tr className="border-b border-line bg-accent text-accent-foreground">
              <th scope="row" className="sticky left-0 z-10 bg-accent px-4 py-2 text-left text-xs font-semibold">
                Left to mark
              </th>
              {list.map((h) => {
                const waiting = pendingByHw.get(h.id)?.length ?? 0;
                const done = approvedByHw.get(h.id) ?? 0;
                return (
                  <td key={h.id} className="border-l border-line px-3 py-2">
                    {waiting > 0 ? (
                      <span className={cn(pill, "bg-warn py-0.5 text-primary-foreground")}>{waiting} waiting</span>
                    ) : done > 0 ? (
                      <span className={cn(pill, "bg-ok py-0.5 text-primary-foreground")}>{check}All marked</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Nothing in yet</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {roster.map((s, i) => (
              <tr key={s.id} className="border-t border-line">
                <th
                  scope="row"
                  className={cn("sticky left-0 z-10 px-4 py-2.5 text-left font-medium", i % 2 ? zebra : "bg-card")}
                >
                  {s.full_name}
                </th>
                {list.map((h) => (
                  <td key={h.id} className={cn("border-l border-line px-3 py-2", i % 2 && zebra)}>
                    {cellChip(h, s.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  /** "HW 3 to 6", or "HW 1, 2, 9" when they do not run on — for a week's tab. */
  const rangeOf = (list: Hw[]) => {
    const nums = [...new Set(list.map((h) => (h.number > 100 ? h.number % 100 : h.number)))].sort((a, b) => a - b);
    if (nums.length === 0) return "none set";
    if (nums.length === 1) return `HW ${nums[0]}`;
    const runsOn = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    if (runsOn) return `HW ${nums[0]} to ${nums[nums.length - 1]}`;
    return nums.length <= 4 ? `HW ${nums.join(", ")}` : `${nums.length} homeworks`;
  };

  const weekTabs: { tab: WeekTab; list: Hw[] }[] = [
    { tab: { id: "this", label: "This week", sub: rangeOf(thisWeekHws), waiting: waitingIn(thisWeekHws) }, list: thisWeekHws },
    ...(lastWeek
      ? [{ tab: { id: lastWeek.id, label: "Last week", sub: rangeOf(lastWeekHws), waiting: waitingIn(lastWeekHws) }, list: lastWeekHws }]
      : []),
    ...earlierWeeks.slice(1).flatMap((w) => {
      const list = earlierByWeek.get(w.id) ?? [];
      const waiting = waitingIn(list);
      return waiting > 0 ? [{ tab: { id: w.id, label: weekName(w), sub: rangeOf(list), waiting }, list }] : [];
    }),
    ...(unfiled.some((h) => pendingByHw.has(h.id))
      ? [(() => {
          const list = unfiled.filter((h) => pendingByHw.has(h.id)).sort(byNumber);
          return { tab: { id: "other", label: "Earlier", sub: rangeOf(list), waiting: waitingIn(list) }, list };
        })()]
      : []),
  ];

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
          <div className="flex flex-wrap items-center gap-3">
            <ClassFilter classes={scope.classes} selected={scope.selected?.id ?? null} own={scope.own} />
            <HomeworkViewToggle view={view} />
          </div>
        </div>
        <p>
          {scope.label} ·{" "}
          {view === "table"
            ? "every student against every homework, a week at a time."
            : "this week first, then last week, then anything still waiting, then the whole year."}
        </p>
      </header>

      {/* No `space-y-*` around these sections: the utility overwrites the
          margins `.divider` sets, which is the whole vertical rhythm of the
          page. The cards inside a section take a flex gap instead. */}
      {view === "table" ? (
        <section>
          <Rule label="By week" />
          <HomeworkWeekTabs
            tabs={weekTabs.map((t) => t.tab)}
            panels={weekTabs.map((t) => weekGrid(t.list))}
          />
        </section>
      ) : (
        <>
          <section>
            <Rule label={`This week${week ? ` · ${weekName(week)}` : ""}`} />
            {thisWeekHws.length === 0 ? (
              <p className="border border-line bg-card px-4 py-3 text-sm text-muted-foreground">
                No homework is set for this week.
              </p>
            ) : (
              cards(thisWeekHws)
            )}
          </section>

          {lastWeek && (
            <section>
              <Rule label={`Last week · ${weekName(lastWeek)}`} />
              {cards(lastWeekHws)}
            </section>
          )}

          {backlogHws.length > 0 && (
            <section>
              <Rule label="Still waiting from earlier weeks" />
              {cards(backlogHws)}
            </section>
          )}
        </>
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
