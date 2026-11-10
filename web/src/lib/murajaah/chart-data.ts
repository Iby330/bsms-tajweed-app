/**
 * What the attempt chart shows, for both the listener's "My revision" and the
 * teacher's student panel. Pure and client-safe.
 *
 * Views (owner, 2026-11-10): every single portion label the student has
 * saved, plus "All juz" and "All hizb" (never "All surahs"). The default is
 * All juz if there is any juz attempt, else All hizb, else the latest label.
 *
 * In an aggregate view a multi-unit attempt ("Juz 28 + 30") is one bar whose
 * value is its time ÷ its unit count, banded on ONE unit, and the reference
 * lines are one unit's limits. A single-portion view uses the portion's own
 * size.
 *
 * Bars are judged against the CURRENT class target (and the student's
 * override), so the chart moves with the teacher's live edits and its bars
 * always agree with its reference lines. A session's own snapshot verdict is
 * `sessionOutcome` (sessions.ts), for the history list.
 */
import { bandLimits, bandOf, type Band, type BandLimits } from "./bands";
import { mistakeLimitFor, type ClassTarget, type TargetOverride } from "./targets";
import type { SessionView } from "./sessions";

export type ChartSession = Pick<
  SessionView,
  "id" | "kind" | "ns" | "label" | "hizbEq" | "clock" | "createdAt" | "submittedAt" | "mistakes"
>;

export const ALL_JUZ = "all-juz";
export const ALL_HIZB = "all-hizb";

export type ChartView = {
  /** "all-juz", "all-hizb", or the portion label itself. */
  id: string;
  name: string;
  kind: "all-juz" | "all-hizb" | "portion";
  /** Saved attempts in this view. */
  count: number;
  /** The latest attempt's date (ISO). */
  latestAt: string;
};

export type ChartBar = {
  /** The session id. */
  id: string;
  /** When it was saved (ISO). */
  date: string;
  /** The bar's height: the total, or the total ÷ unit count in an aggregate view. */
  valueMs: number;
  totalMs: number;
  /** Set when valueMs is per unit (aggregate views). */
  perUnit: "hizb" | "juz" | null;
  /** The portion label, e.g. "Juz 28 + 30". */
  label: string;
  mistakes: number;
  /** The mistake limit for the whole attempt, by the current targets. */
  limit: number;
  band: Band;
};

export type ChartData = {
  bars: ChartBar[];
  /** The band limits in ms for the bars' scale. */
  refLines: BandLimits;
  perUnit: "hizb" | "juz" | null;
};

const dateOf = (s: ChartSession) => s.submittedAt ?? s.clock.finished_at ?? s.createdAt;
const saved = (list: readonly ChartSession[]) =>
  list.filter((s) => s.submittedAt).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

export function chartViews(sessions: readonly ChartSession[]): { views: ChartView[]; defaultId: string | null } {
  const list = saved(sessions);
  if (!list.length) return { views: [], defaultId: null };

  const views: ChartView[] = [];
  const agg = (id: typeof ALL_JUZ | typeof ALL_HIZB, kind: "juz" | "hizb", name: string) => {
    const of = list.filter((s) => s.kind === kind);
    if (of.length) views.push({ id, name, kind: id, count: of.length, latestAt: dateOf(of[of.length - 1]) });
  };
  agg(ALL_JUZ, "juz", "All juz");
  agg(ALL_HIZB, "hizb", "All hizb");

  const byLabel = new Map<string, ChartSession[]>();
  for (const s of list) byLabel.set(s.label, [...(byLabel.get(s.label) ?? []), s]);
  const portions = [...byLabel.entries()]
    .map(([label, of]): ChartView => ({ id: label, name: label, kind: "portion", count: of.length, latestAt: dateOf(of[of.length - 1]) }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  views.push(...portions);

  const defaultId = views.find((v) => v.id === ALL_JUZ)?.id
    ?? views.find((v) => v.id === ALL_HIZB)?.id
    ?? portions[0].id;
  return { views, defaultId };
}

export function chartBars(
  sessions: readonly ChartSession[],
  viewId: string,
  target: ClassTarget,
  override?: TargetOverride | null,
): ChartData {
  const list = saved(sessions);
  const perUnit = viewId === ALL_JUZ ? "juz" : viewId === ALL_HIZB ? "hizb" : null;
  const of = perUnit ? list.filter((s) => s.kind === perUnit) : list.filter((s) => s.label === viewId);
  const unitEq = perUnit === "juz" ? 2 : 1;
  const scale = perUnit ? unitEq : (of[of.length - 1]?.hizbEq ?? 1);

  const bars = of.map((s): ChartBar => {
    const totalMs = s.clock.elapsed_ms;
    const valueMs = perUnit ? Math.round(totalMs / s.ns.length) : totalMs;
    return {
      id: s.id,
      date: dateOf(s),
      valueMs,
      totalMs,
      perUnit,
      label: s.label,
      mistakes: s.mistakes,
      limit: mistakeLimitFor(s.kind, s.ns, target, override),
      band: bandOf(valueMs, perUnit ? unitEq : s.hizbEq, target.minutes),
    };
  });
  return { bars, refLines: bandLimits(scale, target.minutes), perUnit };
}
