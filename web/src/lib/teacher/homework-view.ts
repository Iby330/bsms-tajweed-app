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
