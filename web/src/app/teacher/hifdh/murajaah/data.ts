import "server-only";

/**
 * Everything the teacher's murāja'ah pages read, once per request (the
 * layout and the page share it through cache()). Only for the teacher whose
 * class is the Esteemed Ustadhs: anyone else gets null and is sent back to
 * the hifdh register. RLS scopes the sessions and targets by
 * teaches_class(), so another teacher would read nothing anyway.
 */
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { teacherClass } from "@/lib/teacher/scope";
import { classSessions, classTarget, overrides } from "@/lib/murajaah/queries";
import type { MurajaahTeacherData } from "@/components/murajaah/teacher/murajaah-teacher";

export const murajaahTeacherData = cache(async (): Promise<MurajaahTeacherData | null> => {
  const cls = await teacherClass();
  if (!cls || cls.section !== "ustadhs") return null;
  const db = await supabaseServer();
  const [{ data: students, error }, sessions, target, ovs] = await Promise.all([
    db.from("profiles").select("id, full_name")
      .eq("class_id", cls.id).eq("role", "student").eq("is_active", true)
      .order("full_name"),
    classSessions(cls.id),
    classTarget(cls.id),
    overrides(cls.id),
  ]);
  if (error) throw new Error(error.message);
  return {
    classId: cls.id,
    className: cls.name,
    students: (students ?? []).map((s) => ({ id: s.id, name: s.full_name })),
    sessions,
    saved: { target, overrides: ovs },
    now: Date.now(),
  };
});
