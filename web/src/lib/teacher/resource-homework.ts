/**
 * The homework behind the teacher's Resources tab.
 *
 * A Resources course (0075, 0077) is open to the class with no week and no
 * deadline, so the homework screen, which files work by the class's weeks,
 * never showed it: the scripts sat unmarked where no teacher could find them.
 * It gets a tab of its own after the weeks. An item the teacher put into one
 * of the class's weeks (class_added_items) is that week's work, so it stays
 * in that week and is left out here.
 */
export function resourceHomework<H extends { id: string; course_id: string | null; number: number }>(
  homeworks: H[],
  resourceCourseIds: Iterable<string>,
  inWeeks: Set<string>,
): H[] {
  const courses = new Set(resourceCourseIds);
  return homeworks
    .filter((h) => h.course_id !== null && courses.has(h.course_id) && !inWeeks.has(h.id))
    .sort((a, b) => a.number - b.number);
}
