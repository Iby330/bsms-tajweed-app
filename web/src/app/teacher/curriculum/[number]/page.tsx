import { redirect } from "next/navigation";

/**
 * A homework's results live under /teacher/homework now — one page, reached
 * from either section, so a mark entered from the curriculum and a mark entered
 * from the marking queue are the same act on the same screen.
 *
 * Old links follow, keeping whatever they carried: the class being looked at,
 * the tab, the student. `from=course` is added so the trail still steps back
 * into the course this homework belongs to.
 */
export default async function CurriculumHomeworkMoved({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ number }, query] = await Promise.all([params, searchParams]);

  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") q.set(key, value);
    else if (Array.isArray(value) && value[0] !== undefined) q.set(key, value[0]);
  }
  q.set("from", "course");

  redirect(`/teacher/homework/${number}?${q}`);
}
