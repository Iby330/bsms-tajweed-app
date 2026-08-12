import { cache } from "react";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";

export type TeacherClass = { id: string; name: string; section: string };

/**
 * A teacher's own class — what the teacher screens narrow down to.
 *
 * This is about usability, not permission. The programme runs one class per
 * teacher, and showing all seven on the register, roster, hifz and homework
 * screens buries a teacher's twenty students in a hundred and forty for no
 * gain. So those screens list this class and drop their class switchers.
 * Nothing here is a security boundary — teachers remain trusted, the RLS
 * policies are unchanged, and cross-class views live on the Classes screen
 * until proper admin accounts arrive.
 *
 * `classes.teacher_id` is the source of truth; `profiles.class_id` is the
 * fallback for a teacher who was given a class but never set as its owner.
 * Returns null when neither says anything — the screens then say so plainly
 * rather than quietly showing someone else's students.
 */
export const teacherClass = cache(async (): Promise<TeacherClass | null> => {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") return null;
  const db = await supabaseServer();

  const { data: owned } = await db
    .from("classes")
    .select("id, name, section")
    .eq("teacher_id", profile.id)
    .maybeSingle();
  if (owned) return owned as TeacherClass;

  if (profile.class_id) {
    const { data: assigned } = await db
      .from("classes")
      .select("id, name, section")
      .eq("id", profile.class_id)
      .maybeSingle();
    if (assigned) return assigned as TeacherClass;
  }
  return null;
});

/**
 * Active students the teacher's screens should list: their own class, or
 * every student when they have no class of their own.
 *
 * That fallback is deliberate. An account with no class is the programme
 * lead rather than a class teacher, and narrowing them to nothing would lock
 * them out of screens they use today. It is the same everything-view the
 * teacher screens had before they were scoped, and the seat a real admin
 * role will eventually take over.
 */
export const teacherRoster = cache(
  async (): Promise<{ id: string; full_name: string }[]> => {
    const cls = await teacherClass();
    const db = await supabaseServer();
    let q = db
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .eq("is_active", true);
    if (cls) q = q.eq("class_id", cls.id);
    const { data } = await q.order("full_name");
    return data ?? [];
  },
);

/** What to call the current scope in a heading. */
export async function scopeLabel(): Promise<string> {
  const cls = await teacherClass();
  return cls?.name ?? "All classes";
}

