import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { teacherRoster } from "@/lib/teacher/scope";
import { memorisationList, nextToHear, type Surah } from "./pace";

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
 * which surah is next) only has to be right in one place.
 *
 * A student with no `hifz_profiles` row reads as `target: 0, passed: 0`,
 * which `memorisationList` turns into an empty `run` and a null `next` —
 * the same "no target set" a zero-length run already meant.
 */
export async function rosterWithNext(): Promise<RosterStudent[]> {
  const [students, surahs] = await Promise.all([teacherRoster(), getCachedSurahs()]);
  const ids = students.map((s) => s.id);
  const db = await supabaseServer();
  const [{ data: progress }, records] = ids.length
    ? await Promise.all([
        db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids),
        passRecords(db, ids),
      ])
    : [{ data: [] }, []];
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));
  // `next` is by membership, not `run[passed]`: a range hearing can leave a
  // hole, and the hole is the surah to hear next (see `nextToHear`).
  const passedBy = new Map<string, number[]>();
  for (const r of records) {
    const list = passedBy.get(r.student_id) ?? [];
    list.push(r.surah_number);
    passedBy.set(r.student_id, list);
  }
  const all = surahs as Surah[];

  return students.map((s) => {
    const p = byStudent.get(s.id);
    const target = p ? Number(p.target_count) : 0;
    const passed = p ? Number(p.passed) : 0;
    const startSurah = Number(p?.start_surah ?? 114);
    const run = memorisationList(startSurah, target, all);
    return { id: s.id, name: s.full_name, startSurah, target, passed, run, next: nextToHear(run, passedBy.get(s.id) ?? []) };
  });
}

/**
 * Every pass record for these students, paged. A whole-cohort roster (a
 * teacher with no class of their own) runs past PostgREST's 1000-row cap,
 * and a silently short read would name an already-passed surah as next.
 */
async function passRecords(
  db: Awaited<ReturnType<typeof supabaseServer>>,
  ids: string[],
): Promise<{ student_id: string; surah_number: number }[]> {
  const out: { student_id: string; surah_number: number }[] = [];
  const CHUNK = 1000;
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await db
      .from("hifz_records")
      .select("student_id, surah_number")
      .in("student_id", ids)
      .order("student_id")
      .order("surah_number")
      .range(from, from + CHUNK - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < CHUNK) break;
  }
  return out;
}
