/**
 * Where a homework page's "back" link should point.
 *
 * A homework is reachable from four places and "back" means something
 * different from each: from the lesson it means the video, from Progress it
 * means Progress. A single hard-wired link is wrong three times out of four.
 *
 * The origin travels in the URL as `?from=` rather than being sniffed from
 * the referrer — a referrer is lost on refresh, absent on a fresh tab, and
 * wrong after a redirect, whereas the param survives all three. Arriving with
 * no param (a bookmark, a shared link) is a normal state rather than an error:
 * the breadcrumb already says where the page sits, so we simply offer no
 * back link and let it speak for itself.
 */

export const HOMEWORK_ORIGINS = ["video", "home", "progress", "course"] as const;
export type HomeworkOrigin = (typeof HOMEWORK_ORIGINS)[number];

/** Anything unrecognised is treated as "no origin" — a hand-edited or stale
 *  URL should degrade to the breadcrumb, never 404 or throw. */
export function parseOrigin(value: unknown): HomeworkOrigin | null {
  return typeof value === "string" &&
    (HOMEWORK_ORIGINS as readonly string[]).includes(value)
    ? (value as HomeworkOrigin)
    : null;
}

export type NavLink = { href: string; label: string };

export type HomeworkNav = {
  /** Retraces the student's steps. Null when we can't know where they were. */
  back: NavLink | null;
  /** The lesson this homework belongs to. Null when the video IS the back
   *  link (never offer the same destination twice) or the course has no video. */
  video: NavLink | null;
};

export function homeworkNav(
  origin: HomeworkOrigin | null,
  ctx: {
    lessonId?: string | null;
    termId?: number | null;
    series?: string | null;
    courseLabel?: string | null;
  },
): HomeworkNav {
  const video: NavLink | null = ctx.lessonId
    ? { href: `/lessons/${ctx.lessonId}`, label: "Go to the video" }
    : null;

  switch (origin) {
    case "video":
      // They came from the video, so it's the return journey — framed as
      // "back", and not repeated as a second link to the same place.
      return video
        ? { back: { href: video.href, label: "Back to the video" }, video: null }
        : { back: null, video: null };

    case "home":
      return { back: { href: "/home", label: "Back to Home" }, video };

    case "progress":
      return { back: { href: "/progress", label: "Back to Progress" }, video };

    case "course":
      // Course pages are term-scoped, so both parts are needed to get back to
      // the exact one they were browsing.
      return ctx.termId && ctx.series
        ? {
            back: {
              href: `/courses/${ctx.termId}/${ctx.series}`,
              label: `Back to ${ctx.courseLabel ?? "the course"}`,
            },
            video,
          }
        : { back: null, video };

    default:
      return { back: null, video };
  }
}
