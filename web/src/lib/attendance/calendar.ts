import { isoDate, type SessionType } from "./session";

/**
 * The teaching calendar for the Tajweed year.
 *
 * Classes run twice a week, Mondays and Thursdays, from 5 Oct 2026 to 28 May
 * 2027 — 68 sessions, 34 of each. Everything downstream (the register's date
 * picker, the guard on the write path) derives from the three constants below,
 * so the whole year is defined in one place.
 *
 * The rule is deliberately generated rather than listed: a hand-typed list of
 * 68 dates is 68 chances to fat-finger a day, and any of them would silently
 * become a register nobody could open.
 */

/** First day of the year. Must be a Monday or Thursday to be a session itself. */
export const YEAR_START = "2026-10-05"; // Monday
/** Last day of the year — inclusive. The final session is the Thursday before,
 *  27 May 2027, because 28 May is a Friday. */
export const YEAR_END = "2027-05-28";

/**
 * Mondays and Thursdays that fall inside the year but are NOT taught — half
 * terms, bank holidays, Eid. Keyed by date so the picker can say *why* a
 * normal lesson day is greyed out instead of just swallowing it.
 *
 * EMPTY UNTIL THE FACULTY CALENDAR ARRIVES. Adding one is a single line here;
 * nothing else needs to change.
 */
export const HOLIDAYS: Readonly<Record<string, string>> = {
  // "2026-12-21": "Winter break",
};

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse YYYY-MM-DD to a LOCAL midday Date. Midday, not midnight, so a DST
 *  boundary can shunt the clock an hour either way without changing the day. */
function fromIso(iso: string): Date | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 12);
  // Reject the rollovers Date() accepts silently: 2027-02-31 is not a day.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  return date;
}

const MONDAY = 1;
const THURSDAY = 4;

let cached: readonly string[] | null = null;

/** Every taught date of the year, ascending. Generated once and reused —
 *  the picker asks for this on every render. */
export function sessionDates(): readonly string[] {
  if (cached) return cached;
  const end = fromIso(YEAR_END)!;
  const out: string[] = [];
  for (const cursor = fromIso(YEAR_START)!; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    if (day !== MONDAY && day !== THURSDAY) continue;
    const iso = isoDate(cursor);
    if (iso in HOLIDAYS) continue;
    out.push(iso);
  }
  cached = out;
  return cached;
}

/** True only for a date a class is actually taught on. */
export function isSessionDate(iso: string): boolean {
  return sessionDates().includes(iso);
}

/**
 * Which of the two weekly sessions a date is, or null if it isn't one.
 *
 * Unlike the old day-range guess, this needs no fallback: the date IS the
 * session. A teacher catching up on Tuesday picks Monday's date, which is the
 * date the register belongs to anyway.
 */
export function sessionTypeFor(iso: string): SessionType | null {
  if (!isSessionDate(iso)) return null;
  return fromIso(iso)!.getDay() === MONDAY ? "monday" : "thursday";
}

/** Why a Monday or Thursday inside the year isn't taught, if it isn't. Null
 *  for taught days and for anything outside the year. */
export function holidayReason(iso: string): string | null {
  return HOLIDAYS[iso] ?? null;
}

/**
 * The session a date should resolve to: itself if it's taught, otherwise the
 * most recent taught date before it. Dates before the year open on its first
 * session, dates after it on its last — the register always has somewhere to
 * land, even when opened in August.
 */
export function nearestSessionDate(iso: string): string {
  const dates = sessionDates();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!ISO.test(iso) || iso < first) return first;
  if (iso >= last) return last;
  // ISO dates sort as strings, so no parsing is needed to walk backwards.
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i] <= iso) return dates[i];
  return first;
}

/**
 * The session to OPEN ON when nobody has asked for a date — itself if today is
 * a lesson day, otherwise the next one coming.
 *
 * The counterpart to `nearestSessionDate`, and deliberately not a replacement
 * for it. This one answers "which register am I about to take", so a Tuesday
 * resolves forward to Thursday. `nearestSessionDate` answers "which real
 * lesson did this typed date mean", and has to keep resolving backwards — used
 * here, picking the 14th in the calendar would silently land on the 15th.
 */
export function nextSessionDate(iso: string): string {
  const dates = sessionDates();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!ISO.test(iso) || iso <= first) return first;
  if (iso > last) return last;
  for (const d of dates) if (d >= iso) return d;
  return last;
}

/**
 * The taught date immediately before `iso`, or null if it is the year's first.
 *
 * Exists so the register can point at the session behind it: opening on the
 * next lesson means the last one scrolls out of view, and a register nobody
 * filled in is silent otherwise.
 */
export function previousSessionDate(iso: string): string | null {
  const dates = sessionDates();
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i] < iso) return dates[i];
  return null;
}
