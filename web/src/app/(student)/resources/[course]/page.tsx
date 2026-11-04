import { redirect } from "next/navigation";

/** Moved to /courses/series/[course] when Resources was folded into Courses. */
export default async function ResourceCourse({ params }: { params: Promise<{ course: string }> }) {
  const { course } = await params;
  redirect(`/courses/series/${encodeURIComponent(course)}`);
}
