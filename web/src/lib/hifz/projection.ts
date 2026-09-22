/**
 * The milestones of the two-juz run, for the landing page's progress chart.
 *
 * Deliberately milestones and not dates. A date on the X axis would mean
 * asserting a pace — "one surah a week" — and the programme sets targets per
 * student, so any single rate would be a promise nobody has signed off. The
 * waypoints below are structural facts instead: where a hizb ends, where a juz
 * ends. They are read off HIZB_BOUNDS and JUZ_BOUNDS, so the chart cannot
 * disagree with what the product itself counts as a hizb or a juz.
 */
import { HIZB_BOUNDS, JUZ_BOUNDS } from "./hizb";
import { RUN } from "./run";

export type Milestone = {
  /** What the point is called on the chart. */
  label: string;
  /** The surah the student has reached at this point. */
  reachedEn: string;
  reachedAr: string;
  surahs: number;
  ayahs: number;
};

/** Everything from An-Nas down to (and including) `lowest`. */
function upTo(lowest: number): Omit<Milestone, "label"> {
  const got = RUN.filter((s) => s.number >= lowest);
  const last = got[got.length - 1];
  return {
    reachedEn: last.en,
    reachedAr: last.ar,
    surahs: got.length,
    ayahs: got.reduce((n, s) => n + s.ayahs, 0),
  };
}

const lowestOfHizb = (h: number) => {
  const b = HIZB_BOUNDS.find((x) => x.hizb === h);
  if (!b) throw new Error(`no bounds for hizb ${h}`);
  return b.from;
};
const lowestOfJuz = (j: number) => {
  const b = JUZ_BOUNDS.find((x) => x.juz === j);
  if (!b) throw new Error(`no bounds for juz ${j}`);
  return b.from;
};

/**
 * Three points, in memorisation order. Three rather than more because the
 * chart has to be read in the few seconds it is on screen, and because these
 * three are the ones a student would actually name: the first hizb, the first
 * juz, and the whole run.
 */
export const MILESTONES: readonly Milestone[] = [
  { label: "Hizb 60", ...upTo(lowestOfHizb(60)) },
  { label: "Juz 'Amma", ...upTo(lowestOfJuz(30)) },
  { label: "Two juz", ...upTo(lowestOfJuz(29)) },
];
