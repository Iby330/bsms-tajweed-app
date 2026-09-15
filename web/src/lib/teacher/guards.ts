import "server-only";
import { currentProfile } from "@/lib/supabase/server";
import { teacherRoster } from "./scope";

/** The caller is a signed-in teacher. Throws otherwise. */
export async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

/**
 * …and this student is one of theirs. The pages are scoped so the buttons
 * are hidden; this is what stops the action itself, which a hidden button
 * does not. RLS still grants teachers the whole cohort — this is blast
 * radius, not a security boundary.
 */
export async function requireOwnStudent(studentId: string): Promise<void> {
  const roster = await teacherRoster();
  if (!roster.some((s) => s.id === studentId)) throw new Error("Not your student.");
}
