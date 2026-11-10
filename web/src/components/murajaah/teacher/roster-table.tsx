"use client";

/**
 * Prototype design A, "Roster table": the class at a glance.
 *
 * - A summary line, the "Needs attention" strip, then one row per student:
 *   last portion and when, last time in its band, mistakes against the
 *   limit, best per hizb, the last 7 days, and the trend.
 * - Phones get the same rows as stacked cards (no sideways scroll).
 * - Everything is judged by the PREVIEW target, so the targets panel's
 *   unsaved edit shows here as it is typed.
 * - A row opens the student's page (a real URL, so it can be linked).
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BandPill, LimitMark } from "@/components/murajaah/band-pill";
import { formatClock } from "@/lib/murajaah/bands";
import { cn } from "@/lib/utils";
import { useMurajaahTeacher } from "./murajaah-teacher";
import {
  classSummary, dateOf, initials, needsAttention, relativeDay, rosterStats, sortRoster, TREND_LABEL,
  type SortKey, type StudentStats,
} from "./roster-data";

export const studentHref = (id: string) => `/teacher/hifdh/murajaah/${id}`;

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const fmtDay = (iso: string) => DAY.format(new Date(iso));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

const COLS: [SortKey, string][] = [
  ["name", "Student"], ["last", "Last portion"], ["time", "Last time"], ["mistakes", "Mistakes"],
  ["best", "Best / hizb"], ["week", "Last 7 days"], ["trend", "Trend"],
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 text-[0.7rem] font-semibold text-brand not-italic", className)}
    >
      {initials(name)}
    </i>
  );
}

export function CustomTag() {
  return (
    <span className="rounded border border-brand/40 px-1.5 py-px text-[0.6rem] font-semibold tracking-[0.08em] text-brand uppercase">
      Custom limits
    </span>
  );
}

/** Seven small squares, oldest day first, and the count. */
export function WeekStrip({ st }: { st: StudentStats }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-flex gap-0.5">
        {st.week.map((n, i) => (
          <i
            key={st.weekDays[i]}
            title={`${fmtDay(`${st.weekDays[i]}T12:00:00Z`)}: ${plural(n, "attempt")}`}
            className={cn("h-3.5 w-2 rounded-[2px]", n > 1 ? "bg-brand" : n ? "bg-brand/55" : "bg-brand/12")}
          />
        ))}
      </span>
      <b className="tabular-nums">{st.weekTotal}</b>
      <span className="sr-only"> attempts in the last 7 days</span>
    </span>
  );
}

/** Time per hizb over the last eight attempts; the dot is the latest. */
export function Spark({ values }: { values: number[] }) {
  const v = values.slice(-8);
  if (v.length < 2) return <span className="text-muted-foreground">—</span>;
  const W = 72, H = 24, p = 3;
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((y, i) => [p + (i * (W - 2 * p)) / (v.length - 1), H - p - ((y - lo) / r) * (H - 2 * p)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="shrink-0 text-foreground/70">
      <polyline points={pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.6} fill="currentColor" />
    </svg>
  );
}

function Reason({ text }: { text: string }) {
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <i aria-hidden className="size-1.5 shrink-0 rounded-full bg-danger" />
      {text}
    </span>
  );
}

export function RosterTable() {
  const { students, sessions, preview, now, setPanelOpen } = useMurajaahTeacher();
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const rows = useMemo(
    () => rosterStats(students, sessions, preview.target, preview.overrides, now),
    [students, sessions, preview, now],
  );
  const sorted = useMemo(() => sortRoster(rows, sort.key, sort.dir), [rows, sort]);
  const attention = needsAttention(rows);
  const sum = classSummary(rows);
  const anyAttempt = rows.some((r) => r.last);
  const { minutes: T, limits: M } = preview.target;
  const custom = rows.filter((r) => r.hasOverride).map((r) => r.student.name);

  const sortBy = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  if (!students.length) {
    return <div className="field"><p className="box c12 text-sm text-muted-foreground">No active students in this class yet.</p></div>;
  }

  return (
    <section aria-label="Class overview" className="space-y-4">
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground" data-summary>
        <span><b className="text-foreground">{sum.students}</b> students</span>
        <span>
          <b className="text-foreground">{sum.weekTotal}</b> {sum.weekTotal === 1 ? "attempt" : "attempts"} in the last 7 days, by {sum.activeWeek} of {sum.students}
        </span>
        <span><b className="text-foreground">{sum.faster}</b> getting faster per hizb</span>
      </p>

      {!anyAttempt ? (
        <div className="field">
          <div className="box c12" data-empty>
            <h2 className="text-base font-semibold">No revision logged yet</h2>
            <p className="text-sm text-muted-foreground">
              Sessions appear here once the class start logging: on their Hifdh page&apos;s Review tab, a listener picks a
              classmate and a portion, times the recitation and counts the mistakes. Each saved attempt then shows on this
              roster and on that student&apos;s page. You can set the targets now, so the first attempts are judged by them.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="field">
            <div className="box c12 flex-row flex-wrap items-baseline gap-x-5 gap-y-1.5 py-3" data-attention>
              <span className="label">Needs attention</span>
              {attention.length ? (
                attention.map((r) => (
                  <span key={r.student.id} className="text-sm">
                    <Link href={studentHref(r.student.id)} className="font-semibold underline underline-offset-3">
                      {r.student.name.split(" ")[0]}
                    </Link>{" "}
                    <span className="text-muted-foreground">{r.reasons.join("; ").toLowerCase()}</span>
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  No one right now. Everyone has logged this week and is within their targets.
                </span>
              )}
            </div>
          </div>

          {/* Desktop and tablet: the table. */}
          <div className="field max-md:hidden">
            <div className="box c12 gap-0 overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm" data-roster>
                <caption className="sr-only">
                  The class, one student per row. Times are coloured by band, judged per hizb. Select a student to open their page.
                </caption>
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {COLS.map(([k, label]) => (
                      <th
                        key={k}
                        scope="col"
                        aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                        className="px-3 py-2.5 first:pl-4"
                      >
                        <button
                          type="button"
                          onClick={() => sortBy(k)}
                          className="label inline-flex cursor-pointer items-center gap-1 whitespace-nowrap hover:text-foreground"
                        >
                          {label}
                          <span aria-hidden className={cn(sort.key !== k && "opacity-0")}>{sort.key === k && sort.dir === -1 ? "▼" : "▲"}</span>
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="w-8"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((st) => {
                    const L = st.last;
                    return (
                      <tr
                        key={st.student.id}
                        data-student={st.student.id}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("a")) return;
                          router.push(studentHref(st.student.id));
                        }}
                        className="cursor-pointer border-b border-border align-middle transition-colors last:border-b-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pr-3 pl-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={st.student.name} />
                            <div className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Link href={studentHref(st.student.id)} className="font-semibold hover:underline">
                                  {st.student.name}
                                </Link>
                                {st.hasOverride && <CustomTag />}
                              </span>
                              {st.reasons[0] && <Reason text={st.reasons[0]} />}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {L ? (
                            <>
                              <div>{L.label}</div>
                              <div className="text-xs text-muted-foreground">{fmtDay(dateOf(L))}, {relativeDay(dateOf(L), now)}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No attempts</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{L && st.lastBand && <BandPill band={st.lastBand} ms={L.clock.elapsed_ms} />}</td>
                        <td className="px-3 py-3">{L && st.lastLimit != null && <LimitMark mistakes={L.mistakes} limit={st.lastLimit} />}</td>
                        <td className="px-3 py-3">
                          {st.best && (
                            <>
                              <b className="tabular-nums">{formatClock(st.best.ms)}</b>
                              <div className="text-xs text-muted-foreground">{st.best.label}</div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3"><WeekStrip st={st} /></td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-2">
                            <Spark values={st.perHizbMs} />
                            <span className="text-xs text-muted-foreground">{TREND_LABEL[st.trend]}</span>
                          </span>
                        </td>
                        <td className="pr-3 text-muted-foreground"><ChevronRight aria-hidden className="size-4" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Phones: the same rows as stacked cards. */}
          <ul className="field md:hidden" data-roster-cards>
            {sorted.map((st) => {
              const L = st.last;
              return (
                <li key={st.student.id} className="box c12 gap-2 p-0">
                  <Link href={studentHref(st.student.id)} className="grid gap-2 px-4 py-3.5 text-sm">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={st.student.name} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <b className="font-semibold">{st.student.name}</b>
                            {st.hasOverride && <CustomTag />}
                          </span>
                          {st.reasons[0] && <Reason text={st.reasons[0]} />}
                        </span>
                      </span>
                      {L && st.lastBand && <BandPill band={st.lastBand} ms={L.clock.elapsed_ms} />}
                    </span>
                    {L ? (
                      <>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate">
                            {L.label} <span className="text-xs text-muted-foreground">· {fmtDay(dateOf(L))}, {relativeDay(dateOf(L), now)}</span>
                          </span>
                          {st.lastLimit != null && <LimitMark mistakes={L.mistakes} limit={st.lastLimit} />}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <WeekStrip st={st} /> in 7 days
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Spark values={st.perHizbMs} />
                            <span className="text-xs text-muted-foreground">{TREND_LABEL[st.trend]}</span>
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No attempts yet</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground" data-footnote>
        Class targets, per hizb: <b className="text-foreground">ideal</b> ≤ {formatClock(T.ideal * 60_000)},{" "}
        <b className="text-foreground">good</b> ≤ {formatClock(T.good * 60_000)},{" "}
        <b className="text-foreground">acceptable</b> ≤ {formatClock(T.acceptable * 60_000)}, too slow beyond. Mistakes: ≤ {M.hizb} per
        hizb, ≤ {M.juz} per juz, ≤ {M.surah10} per 10 pages of a surah.
        {custom.length > 0 && <> Custom limits: {custom.join(", ")}.</>} Trend compares time per hizb over the last three attempts
        with the three before.{" "}
        <button type="button" onClick={() => setPanelOpen(true)} className="cursor-pointer font-medium text-brand underline underline-offset-3">
          Edit targets
        </button>
      </p>
    </section>
  );
}
