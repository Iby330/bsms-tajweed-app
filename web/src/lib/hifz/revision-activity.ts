/**
 * Revision activity, day by day — the data behind the heatmap.
 *
 * "How many pages did they do" is not recorded anywhere yet: revision_sessions
 * carries no page range, and a timed-session feature that would supply one is
 * still to come. What IS recorded is dated surah sign-offs (hifz_records
 * .passed_at) and quran_words, which maps every seeded surah to the mushaf
 * pages it spans. A surah signed off on a day therefore converts to a real
 * page count for that day, from data that already exists.
 *
 * `pages` is the intensity the grid colours by. When the timed hizb sessions
 * land they become a second source: add their pages into the same per-day
 * totals and nothing downstream changes.
 *
 * Everything here is pure so it can be tested without a database.
 */

/** One day's activity for one student. */
export type RevisionDay = {
  date: string;      // YYYY-MM-DD, the local calendar day
  pages: number;     // mushaf pages covered — the heat value
  surahs: number;    // surahs signed off
  sessions: number;  // peer-revision sessions submitted
};

export type HeatmapBin = { bin: number; count: number; date: Date; day: RevisionDay | null };
export type HeatmapColumn = { bin: number; bins: HeatmapBin[] };

/** Five visual levels: 0 empty, then four bands of increasing activity.
 *  A mushaf page is a big unit — a whole page in a day is already a good
 *  day — so the bands are deliberately tight rather than a wide scale. */
export function contributionLevel(pages: number): number {
  if (pages <= 0) return 0;
  if (pages <= 1) return 1;
  if (pages <= 2) return 2;
  if (pages <= 4) return 3;
  return 4;
}

/**
 * The level a cell is drawn at. Pages set the intensity, but a day with a
 * revision session and no sign-off is still a day the student revised — it
 * must light up, not sit empty under a tooltip that says "1 session". Until
 * timed sessions record their own pages, a session is worth the first band.
 */
export function dayLevel(day: RevisionDay | null | undefined): number {
  if (!day) return 0;
  return Math.max(contributionLevel(day.pages), day.sessions > 0 ? 1 : 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in LOCAL time. `toISOString` would shift the day backwards for
 *  anyone west of UTC, filing late-evening activity under the day before. */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Midnight local, so day arithmetic never drifts across a DST boundary. */
const atMidnight = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Lay days out as week columns of seven day rows, oldest column first —
 * the shape the heatmap renders.
 *
 * The grid always starts on a `weekStartDay` boundary and always ends on the
 * column holding `end`, so the last column is partial when the week is not
 * over. Days outside the requested window are omitted rather than zero-filled
 * so the leading and trailing edges stay ragged like a real contribution grid.
 */
export function buildActivityGrid(
  days: RevisionDay[],
  { end, weeks = 53, weekStartDay = 0 }: { end: Date; weeks?: number; weekStartDay?: number },
): HeatmapColumn[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last = atMidnight(end);

  // Rewind to this week's start, then back `weeks - 1` further columns.
  const offsetIntoWeek = (last.getDay() - weekStartDay + 7) % 7;
  const first = new Date(last.getTime() - (offsetIntoWeek + (weeks - 1) * 7) * DAY_MS);

  const columns: HeatmapColumn[] = [];
  for (let w = 0; w < weeks; w++) {
    const bins: HeatmapBin[] = [];
    for (let row = 0; row < 7; row++) {
      const date = new Date(first.getTime() + (w * 7 + row) * DAY_MS);
      if (date.getTime() > last.getTime()) break;   // don't render the future
      const day = byDate.get(dayKey(date)) ?? null;
      bins.push({ bin: row, count: dayLevel(day), date, day });
    }
    if (bins.length) columns.push({ bin: w, bins });
  }
  return columns;
}

/** Roll sign-offs and sessions into one row per day.
 *  `pagesForSurah` comes from quran_words — see getCachedSurahPageSpans. */
export function collectDays(
  signOffs: { surah_number: number; passed_at: string }[],
  sessions: { submitted_at: string }[],
  pagesForSurah: Record<number, number>,
): RevisionDay[] {
  const byDate = new Map<string, RevisionDay>();
  const row = (date: string): RevisionDay => {
    let r = byDate.get(date);
    if (!r) { r = { date, pages: 0, surahs: 0, sessions: 0 }; byDate.set(date, r); }
    return r;
  };
  for (const s of signOffs) {
    // passed_at is a DATE column — already a calendar day, no timezone in it.
    const r = row(s.passed_at.slice(0, 10));
    r.surahs += 1;
    r.pages += pagesForSurah[s.surah_number] ?? 0;
  }
  for (const s of sessions) {
    // submitted_at is a timestamptz; bucket it by the viewer's local day so it
    // lines up with the sign-offs beside it.
    row(dayKey(new Date(s.submitted_at))).sessions += 1;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Totals for the summary line above the grid. */
export function summarise(days: RevisionDay[]): { pages: number; surahs: number; sessions: number; activeDays: number } {
  return days.reduce(
    (acc, d) => ({
      pages: acc.pages + d.pages,
      surahs: acc.surahs + d.surahs,
      sessions: acc.sessions + d.sessions,
      activeDays: acc.activeDays + (d.pages > 0 || d.sessions > 0 ? 1 : 0),
    }),
    { pages: 0, surahs: 0, sessions: 0, activeDays: 0 },
  );
}

/** Longest run of consecutive days with any activity, ending on or before
 *  `end`. Counts calendar days, so a gap of one empty day breaks it. */
export function longestStreak(days: RevisionDay[]): number {
  const active = days.filter((d) => d.pages > 0 || d.sessions > 0).map((d) => d.date).sort();
  let best = 0, run = 0, prev: number | null = null;
  for (const key of active) {
    const [y, m, d] = key.split("-").map(Number);
    const t = new Date(y, m - 1, d).getTime();
    run = prev !== null && t - prev === DAY_MS ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}
