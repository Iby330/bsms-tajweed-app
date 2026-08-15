import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { scopeLabel, teacherRoster } from "@/lib/teacher/scope";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { HifzRegister, type RegisterRow } from "@/components/app/hifz-register";

export const dynamic = "force-dynamic";

export default async function TeacherHifz() {
  const db = await supabaseServer();

  // The label and the roster both hang off the same cached class read, so
  // firing them together costs one class round trip rather than two.
  const [{ weeks }, label, students] = await Promise.all([
    getTermsAndWeeks(),
    scopeLabel(),
    teacherRoster(),
  ]);
  const ids = students.map((s) => s.id);

  const [{ data: progress }, surahs] = await Promise.all([
    ids.length
      ? db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids)
      : Promise.resolve({ data: [] }),
    getCachedSurahs(),
  ]);
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));
  const run = memorisationList(114, (surahs as Surah[]).length, surahs as Surah[]);
  const now = new Date();

  const rows: RegisterRow[] = students.map((s) => {
    const p = byStudent.get(s.id);
    const target = p ? Number(p.target_count) : 0;
    const passed = p ? Number(p.passed) : 0;
    const startSurah = Number(p?.start_surah ?? 114);
    // The student's OWN run — a returning student's start_surah is not 114,
    // so indexing the global list here would name the wrong surah.
    const next = memorisationList(startSurah, target, surahs as Surah[])[passed];
    return {
      studentId: s.id,
      name: s.full_name,
      nextName: next?.name_en ?? null,
      passed,
      target,
      expected: expectedPassed(now, weeks, target),
      pace: p ? paceStatus(passed, expectedPassed(now, weeks, target)) : null,
      startSurah,
    };
  });

  return (
    <>
      <header className="masthead">
        <h1><span>Hifdh register</span></h1>
        <p>
          {label} · Thursday recitation. Colour shows each student against the calendar.
          Select students to set their target.
        </p>
      </header>

      {rows.length ? (
        <HifzRegister rows={rows} surahs={run} />
      ) : (
        <p className="box c12  p-6 text-sm text-muted-foreground">
          No active students yet.
        </p>
      )}
    </>
  );
}
