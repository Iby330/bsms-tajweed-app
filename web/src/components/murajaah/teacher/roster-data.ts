/**
 * What the teacher's murāja'ah roster derives from a class's saved sessions.
 * Pure and client-safe (no "use client", no server imports), so the roster
 * can recompute it as the targets panel is edited.
 *
 * Every verdict here uses the CURRENT target (the teacher's live edit while
 * the panel is open), the same rule as chartBars: the roster previews what a
 * change of targets would mean. A session's own snapshot verdict is
 * sessionOutcome(), which the history list uses.
 *
 * - Time per hizb: an attempt's total ÷ its size in hizb-equivalents, which
 *   is what lets a juz and a surah be compared.
 * - Trend (as the prototype): the mean time per hizb of the last three
 *   attempts against the three before, ±4%. Four or five attempts compare
 *   the last two with the two before; fewer than four are "too few".
 * - Needs attention: nothing logged in the last 7 days, the mistake limit
 *   missed twice running, or Too slow twice running.
 * - Days are London days (the programme's zone), and `now` is passed in so
 *   the server and the browser agree.
 */
import { bandOf, type Band } from "@/lib/murajaah/bands";
import type { SessionView } from "@/lib/murajaah/sessions";
import { mistakeLimitFor, type ClassTarget, type OverrideInput, type TargetOverride } from "@/lib/murajaah/targets";

export type RosterStudent = { id: string; name: string };
export type Trend = "faster" | "steady" | "slower" | "few";
export const TREND_LABEL: Record<Trend, string> = {
  faster: "Faster", steady: "Steady", slower: "Slower", few: "Too few",
};

export type StudentStats = {
  student: RosterStudent;
  /** Saved attempts as reciter, oldest first. */
  attempts: SessionView[];
  last: SessionView | null;
  /** The latest attempt by the current target. */
  lastBand: Band | null;
  lastLimit: number | null;
  lastOver: boolean;
  /** Time per hizb of each attempt, oldest first. */
  perHizbMs: number[];
  /** Attempts on each of the last 7 London days, oldest first (today last). */
  week: number[];
  weekDays: string[];
  weekTotal: number;
  best: { ms: number; label: string; date: string } | null;
  trend: Trend;
  /** The trend's relative change (negative = faster); 0 when too few. */
  trendDelta: number;
  /** Attempts within their mistake limit, and not Too slow, by the current target. */
  met: number;
  inTime: number;
  reasons: string[];
  override: TargetOverride | null;
  hasOverride: boolean;
};

const DAY_MS = 86_400_000;
const KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/London" });

export const dateOf = (s: SessionView) => s.submittedAt ?? s.clock.finished_at ?? s.createdAt;

/** "YYYY-MM-DD" of a moment, in London. */
export function dayKey(at: string | number | Date): string {
  return KEY.format(new Date(at));
}

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS);

/** Whole London days between a moment and now. */
export function daysAgo(at: string, now: number): number {
  return dayNumber(dayKey(now)) - dayNumber(dayKey(at));
}

export function relativeDay(at: string, now: number): string {
  const n = daysAgo(at, now);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const two = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return two.toUpperCase();
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const perHizb = (s: SessionView) => s.clock.elapsed_ms / (s.hizbEq > 0 ? s.hizbEq : 1);

function trendOf(per: number[]): { trend: Trend; delta: number } {
  if (per.length < 4) return { trend: "few", delta: 0 };
  const k = Math.min(3, Math.floor(per.length / 2));
  const recent = mean(per.slice(-k));
  const before = mean(per.slice(-2 * k, -k));
  const delta = (recent - before) / before;
  return { trend: delta < -0.04 ? "faster" : delta > 0.04 ? "slower" : "steady", delta };
}

const hasLimits = (o: TargetOverride | null | undefined) =>
  !!o && (o.hizb !== null || o.juz !== null || o.surah10 !== null);

export function studentStats(
  student: RosterStudent,
  sessions: readonly SessionView[],
  target: ClassTarget,
  override: TargetOverride | null | undefined,
  now: number,
): StudentStats {
  const attempts = sessions
    .filter((s) => s.reciterId === student.id && s.submittedAt)
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
  const last = attempts[attempts.length - 1] ?? null;
  const limitOf = (s: SessionView) => mistakeLimitFor(s.kind, s.ns, target, override);
  const bandOfS = (s: SessionView) => bandOf(s.clock.elapsed_ms, s.hizbEq, target.minutes);
  const overOf = (s: SessionView) => s.mistakes > limitOf(s);

  const perHizbMs = attempts.map(perHizb);
  const today = dayNumber(dayKey(now));
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    new Date((today - 6 + i) * DAY_MS).toISOString().slice(0, 10));
  const week = weekDays.map((d) => attempts.filter((s) => dayKey(dateOf(s)) === d).length);
  const weekTotal = week.reduce((a, b) => a + b, 0);

  let bestI = -1;
  perHizbMs.forEach((v, i) => { if (bestI < 0 || v < perHizbMs[bestI]) bestI = i; });
  const best = bestI < 0 ? null : { ms: Math.round(perHizbMs[bestI]), label: attempts[bestI].label, date: dateOf(attempts[bestI]) };

  const { trend, delta } = trendOf(perHizbMs);

  const reasons: string[] = [];
  if (!last) reasons.push("No attempts yet");
  else if (!weekTotal) reasons.push("Nothing logged in 7 days");
  const lastTwo = attempts.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every(overOf)) reasons.push("Over the mistake limit twice running");
  if (lastTwo.length === 2 && lastTwo.every((s) => bandOfS(s) === "slow")) reasons.push("Too slow twice running");

  return {
    student,
    attempts,
    last,
    lastBand: last ? bandOfS(last) : null,
    lastLimit: last ? limitOf(last) : null,
    lastOver: last ? overOf(last) : false,
    perHizbMs,
    week,
    weekDays,
    weekTotal,
    best,
    trend,
    trendDelta: delta,
    met: attempts.filter((s) => !overOf(s)).length,
    inTime: attempts.filter((s) => bandOfS(s) !== "slow").length,
    reasons,
    override: override ?? null,
    hasOverride: hasLimits(override),
  };
}

/** One row per student, in the order given. */
export function rosterStats(
  students: readonly RosterStudent[],
  sessions: readonly SessionView[],
  target: ClassTarget,
  overrides: readonly OverrideInput[],
  now: number,
): StudentStats[] {
  const byId = new Map(overrides.map((o) => [o.studentId, o]));
  return students.map((s) => studentStats(s, sessions, target, byId.get(s.id) ?? null, now));
}

export function classSummary(rows: readonly StudentStats[]) {
  return {
    students: rows.length,
    weekTotal: rows.reduce((t, r) => t + r.weekTotal, 0),
    activeWeek: rows.filter((r) => r.weekTotal > 0).length,
    faster: rows.filter((r) => r.trend === "faster").length,
  };
}

export function needsAttention(rows: readonly StudentStats[]): StudentStats[] {
  return rows.filter((r) => r.reasons.length).sort((a, b) => a.student.name.localeCompare(b.student.name));
}

export type SortKey = "name" | "last" | "time" | "mistakes" | "best" | "week" | "trend";

const SORT: Record<SortKey, (r: StudentStats) => string | number> = {
  name: (r) => r.student.name.toLowerCase(),
  last: (r) => (r.last ? dateOf(r.last) : ""),
  time: (r) => (r.last ? perHizb(r.last) : Infinity),
  mistakes: (r) => (r.last ? r.last.mistakes / Math.max(r.lastLimit ?? 0, 0.5) : -1),
  best: (r) => r.best?.ms ?? Infinity,
  week: (r) => r.weekTotal,
  trend: (r) => (r.trend === "few" ? 0 : r.trendDelta),
};

/** Sorted by a column (dir 1 ascending, -1 descending), ties by name. */
export function sortRoster(rows: readonly StudentStats[], key: SortKey, dir: 1 | -1): StudentStats[] {
  const f = SORT[key];
  return [...rows].sort((x, y) => {
    const a = f(x), b = f(y);
    const c = a < b ? -1 : a > b ? 1 : 0;
    return c * dir || x.student.name.localeCompare(y.student.name);
  });
}
