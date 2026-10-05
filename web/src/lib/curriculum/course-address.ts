import type { ClassSchedule } from "./tree";

/**
 * Where a lesson's or homework's course page is, for this reader.
 *
 * Course pages are found in the reader's own tree, which under a class
 * syllabus files a course by its KEY in the term the class takes it
 * (`/courses/1/ghunna`), not by the series and term its rows are stored
 * under (`/courses/1/tajweed`, or Term 3 for Group 1's Mudūd). Linking by the
 * row's series sent every "back to the course" link from a video or a
 * homework to a page that does not exist. A reader with no syllabus, or one
 * exempt from the calendar (whose tree is the whole programme), keeps the
 * row's own term and series.
 */
export function courseAddress(
  schedule: ClassSchedule | null | undefined,
  row: { courseId?: string | null; series: string; termId: number },
): { termId: number; slug: string; label: string | null } {
  const sc = row.courseId ? schedule?.courses.find((c) => c.courseId === row.courseId) : undefined;
  return sc
    ? { termId: sc.termId, slug: sc.key, label: sc.label }
    : { termId: row.termId, slug: row.series, label: null };
}
