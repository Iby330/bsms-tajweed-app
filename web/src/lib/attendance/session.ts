/**
 * A session is a SUBJECT, not a weekday.
 *
 * It used to be `'monday' | 'thursday'`, which worked only while every class
 * in the programme met on the same two days. The sisters' hifdh class is on a
 * Wednesday, so the weekday no longer identifies the lesson: a sisters'
 * Wednesday and a brothers' Thursday are the same session, and knowing the
 * date alone is not enough to say which session it is — you need the section
 * too. See `TEACHING_DAYS` in ./calendar.
 *
 * The database enum was renamed in step with this (migration 0023), so stored
 * attendance rows carry the same two values.
 */
export type SessionType = "tajweed" | "hifdh";

export const SESSION_TYPES: readonly SessionType[] = ["tajweed", "hifdh"];

/** YYYY-MM-DD in LOCAL time. `toISOString()` would shift the date for anyone
 *  west of UTC — and for us during BST, late evenings roll over a day early.
 *  For calendar arithmetic on dates built from their parts. For "today" on
 *  the server, whose local zone is UTC, use `londonDate`. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD as the day reads in Britain, whatever zone the code runs in.
 *  The server runs in UTC, so between midnight and 1am in BST its own
 *  "today" is still yesterday; every student and teacher is in the UK. */
export function londonDate(d: Date): string {
  const p = Object.fromEntries(londonDay.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function sessionLabel(session: SessionType): string {
  return session === "tajweed" ? "Tajweed" : "Hifdh";
}

/**
 * The colour each session is drawn in: tajweed the page's ink, hifdh the
 * brand accent — the same two weights the rest of the app uses for "the main
 * thing" and "the other thing". Not --ok: these name which kind of session
 * ran, not whether it went well, and --ok now means passed.
 *
 * It lives HERE, in a plain module, rather than beside the grid that uses it.
 * It was briefly exported from the grid's own file, which carries "use
 * client"; a server component importing a value across that boundary gets a
 * client reference rather than the object, so `SESSION_DOT[type]` came back
 * undefined and the legend rendered dots with no colour at all. Nothing
 * catches that — the types are satisfied and the class simply goes missing.
 */
export const SESSION_DOT: Record<SessionType, string> = {
  tajweed: "bg-ink",
  hifdh: "bg-brand",
};
