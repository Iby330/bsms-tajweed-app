/** "2026-09-19" → "19 Sept". For Postgres `date` columns only (passed_at,
 *  starts_on, ends_on, session_date): the value is a calendar day with no
 *  timezone, so it must be formatted in UTC or it shifts back a day west of
 *  Greenwich. Do NOT use for timestamptz (unlock_at, due_at, issued_at) —
 *  those must render in the viewer's local zone. */
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
