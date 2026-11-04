import { redirect } from "next/navigation";

/** Moved to /courses/series/[course]/[lessonId] when Resources was folded into Courses. */
export default async function ResourceVideo({
  params,
}: {
  params: Promise<{ course: string; lessonId: string }>;
}) {
  const { course, lessonId } = await params;
  redirect(`/courses/series/${encodeURIComponent(course)}/${encodeURIComponent(lessonId)}`);
}
