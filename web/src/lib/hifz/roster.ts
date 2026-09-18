import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { teacherRoster } from "@/lib/teacher/scope";
import { memorisationList, type Surah } from "./pace";

export type RosterStudent = {
  id: string;
  name: string;
  /** 114 until a teacher says otherwise. */
  startSurah: number;
  target: number;
  passed: number;
  /** The student's own run — `target` surahs starting at `startSurah`. */
  run: Surah[];
  /** The first unpassed surah on the run; null with no target or a completed run. */
  next: Surah | null;
};

/**
 * The teacher's roster, each student's own memorisation run, and where they
 * have got to on it — "next to hear" derived exactly once. The register
 * (`teacher/hifdh`) and the hearing desk (`teacher/hifdh/hear`) both used to
 * compute this independently; sharing it means a rule (start surah, how
 * `passed` indexes the run) only has to be right in one place.
 *
 * A student with no `hifz_profiles` row reads as `target: 0, passed: 0`,
 * which `memorisationList` turns into an empty `run` and a null `next` —
 * the same "no target set" a zero-length run already meant.
 */
export async function rosterWithNext(): Promise<RosterStudent[]> {
  const [students, surahs] = await Promise.all([teacherRoster(), getCachedSurahs()]);
  const ids = students.map((s) => s.id);
  const db = await supabaseServer();
  const { data: progress } = ids.length
    ? await db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids)
    : { data: [] };
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));
  const all = surahs as Surah[];

  return students.map((s) => {
    const p = byStudent.get(s.id);
    const target = p ? Number(p.target_count) : 0;
    const passed = p ? Number(p.passed) : 0;
    const startSurah = Number(p?.start_surah ?? 114);
    const run = memorisationList(startSurah, target, all);
    return { id: s.id, name: s.full_name, startSurah, target, passed, run, next: run[passed] ?? null };
  });
}
