export type SessionType = "monday" | "thursday";

/**
 * Classes run twice a week. Monday's register covers Mon–Wed, Thursday's covers
 * Thu–Sun, so a teacher opening the register on the day (or catching up the
 * morning after) lands on the right one without touching the selector.
 */
export function defaultSessionFor(date: string | Date): SessionType {
  const d = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  if (Number.isNaN(d.getTime())) return "monday";
  const day = d.getDay(); // 0 = Sunday
  return day >= 1 && day <= 3 ? "monday" : "thursday";
}

/** YYYY-MM-DD in LOCAL time. `toISOString()` would shift the date for anyone
 *  west of UTC — and for us during BST, late evenings roll over a day early. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sessionLabel(session: SessionType): string {
  return session === "monday" ? "Monday" : "Thursday";
}
