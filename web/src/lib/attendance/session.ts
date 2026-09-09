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
 * The database enum was renamed in step with this (migration 0022), so stored
 * attendance rows carry the same two values.
 */
export type SessionType = "tajweed" | "hifdh";

export const SESSION_TYPES: readonly SessionType[] = ["tajweed", "hifdh"];

/** YYYY-MM-DD in LOCAL time. `toISOString()` would shift the date for anyone
 *  west of UTC — and for us during BST, late evenings roll over a day early. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sessionLabel(session: SessionType): string {
  return session === "tajweed" ? "Tajweed" : "Hifdh";
}
