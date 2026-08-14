export type SessionType = "monday" | "thursday";

/** YYYY-MM-DD in LOCAL time. `toISOString()` would shift the date for anyone
 *  west of UTC — and for us during BST, late evenings roll over a day early. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function sessionLabel(session: SessionType): string {
  return session === "monday" ? "Monday" : "Thursday";
}
