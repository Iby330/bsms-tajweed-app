import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ResourceHomework = {
  number: number;
  /** The student's own submission, if they have opened it. */
  status: "draft" | "submitted" | "auto_marked" | "approved" | null;
};
export type ResourceVideo = {
  id: string; title: string; youtubeId: string; ordinal: number;
  /** The course's homework at this video's place (same ordinal), when it has
   *  one: open to the class with no deadline (0077), set in person. */
  homework: ResourceHomework | null;
};
export type ResourceSet = { courseId: string; key: string; label: string; videos: ResourceVideo[] };

/**
 * The extra courses this student's class can watch from Resources (0075):
 * another course's videos, with no week, homework or progress attached.
 *
 * Two reads, on purpose. `class_resources` is read as the student, so RLS
 * hands back only their own class's rows: that row IS the permission. The
 * lessons are then read past RLS, because a resource course is outside the
 * class's plan and RLS would hide every one of its lessons. Only the fields
 * a video grid needs leave this function.
 */
export async function getClassResources(): Promise<ResourceSet[]> {
  const db = await supabaseServer();
  const { data: rows } = await db
    .from("class_resources")
    .select("course_id, position, courses(key, label)")
    .order("position");
  if (!rows?.length) return [];

  const courseIds = rows.map((r) => r.course_id);
  const [{ data: lessons }, { data: homeworks }, { data: subs }] = await Promise.all([
    supabaseAdmin()
      .from("lessons")
      .select("id, title, youtube_id, ordinal, course_id")
      .in("course_id", courseIds)
      .not("youtube_id", "is", null)
      .order("ordinal"),
    // As the student: RLS hands over a Resources course's homework (0077)
    // unless a hold still withholds it, in which case no link is offered.
    db.from("homeworks").select("id, number, course_id, ordinal").in("course_id", courseIds),
    db.from("submissions").select("homework_id, status"),
  ]);
  const statusOf = new Map((subs ?? []).map((x) => [x.homework_id, x.status as ResourceHomework["status"]]));
  const homeworkAt = (courseId: string, ordinal: number): ResourceHomework | null => {
    const h = (homeworks ?? []).find((x) => x.course_id === courseId && x.ordinal === ordinal);
    return h ? { number: h.number, status: statusOf.get(h.id) ?? null } : null;
  };

  return rows.flatMap((r) => {
    const course = r.courses as { key: string; label: string } | null;
    if (!course) return [];
    const videos = (lessons ?? [])
      .filter((l) => l.course_id === r.course_id && l.youtube_id)
      .map((l) => ({
        id: l.id, title: l.title, youtubeId: l.youtube_id!, ordinal: l.ordinal ?? 0,
        homework: homeworkAt(r.course_id, l.ordinal ?? 0),
      }));
    return [{ courseId: r.course_id, key: course.key, label: course.label, videos }];
  });
}

/** One resource course by its key, or null when this class doesn't have it. */
export async function getResourceSet(key: string): Promise<ResourceSet | null> {
  return (await getClassResources()).find((s) => s.key === key) ?? null;
}
