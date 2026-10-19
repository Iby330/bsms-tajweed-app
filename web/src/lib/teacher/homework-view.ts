/**
 * How a teacher reads the homework screen: as a list of what is waiting to be
 * marked, or as a table of every student against every homework.
 *
 * Kept in a plain module rather than beside the toggle: the page reads the
 * cookie on the server, and a constant imported from a "use client" file
 * arrives there as a client reference, not a string.
 */
export const HW_VIEW_COOKIE = "hw_view";

export type HwView = "list" | "table";

/** `?view=` wins (the toggle sets it), then the teacher's last choice, then list. */
export function pickHwView(param: string | undefined, cookie: string | undefined): HwView {
  for (const v of [param, cookie]) if (v === "list" || v === "table") return v;
  return "list";
}

/** The table's Resources tab, after the weeks: homework with no week (0075). */
export const RESOURCES_TAB = "resources";

/**
 * The note above this week's grid when scripts wait on another tab: the first
 * tab is this week, the rest earlier weeks and Resources. Null when nothing
 * waits beyond this week.
 */
export function waitingNote(
  tabs: { id: string; waiting: number }[],
): { text: string; show: string; target: number } | null {
  const target = tabs.findIndex((t, i) => i > 0 && t.waiting > 0);
  if (target < 0) return null;
  const weeks = tabs.slice(1).filter((t) => t.id !== RESOURCES_TAB && t.waiting > 0);
  const resources = tabs.find((t) => t.id === RESOURCES_TAB)?.waiting ?? 0;
  const n = weeks.reduce((sum, t) => sum + t.waiting, 0) + resources;
  const where = [
    ...(weeks.length ? [weeks.length === 1 ? "from an earlier week" : "from earlier weeks"] : []),
    ...(resources > 0 ? ["in Resources"] : []),
  ].join(" and ");
  return {
    text: `${n} script${n === 1 ? "" : "s"} still waiting ${where}`,
    show: tabs[target].id === RESOURCES_TAB ? "Show Resources" : "Show that week",
    target,
  };
}

/**
 * The time of this request, for "has this deadline passed?".
 *
 * The page is force-dynamic, so it renders once per request and the moment is
 * the request's own. Read through here rather than inline because the React
 * purity rule cannot tell a per-request server render from a component that
 * re-renders and would draw a different answer each time.
 */
export function requestTime(): number {
  return Date.now();
}
