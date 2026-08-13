import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { scopeLabel, teacherClass, teacherRoster } from "@/lib/teacher/scope";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { targetPresets } from "@/lib/hifz/targets";
import { ClassTargetForm } from "@/components/app/class-target-form";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeacherHifz() {
  const db = await supabaseServer();

  // The label and the roster both hang off the same cached class read, so
  // firing them together costs one class round trip rather than two.
  const [{ weeks }, label, myClass, students] = await Promise.all([
    getTermsAndWeeks(),
    scopeLabel(),
    teacherClass(),
    teacherRoster(),
  ]);
  const ids = students.map((s) => s.id);

  const [{ data: progress }, { data: profiles }, surahs] = await Promise.all([
    ids.length
      ? db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids)
      : Promise.resolve({ data: [] }),
    // is_custom lives on the table, not the view — the form needs to say how
    // many students an apply will touch before the teacher commits to it.
    ids.length
      ? db.from("hifz_profiles").select("student_id, is_custom").in("student_id", ids)
      : Promise.resolve({ data: [] }),
    getCachedSurahs(),
  ]);
  const byStudent = new Map((progress ?? []).map((p) => [p.student_id!, p]));
  const customCount = (profiles ?? []).filter((p) => p.is_custom).length;
  const run = memorisationList(114, (surahs as Surah[]).length, surahs as Surah[]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Hifz register</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {label} · Thursday recitation. Colour shows each student against the calendar.
        </p>
      </header>

      {/* A class-less programme lead sees every student — "apply to class"
          would mean the whole school, so the card only renders with a class. */}
      {myClass && (
        <ClassTargetForm
          presets={targetPresets(114, run)}
          surahs={run}
          defaultCount={students.length - customCount}
          customCount={customCount}
        />
      )}

      <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
        {students.map((s) => {
          const p = byStudent.get(s.id);
          const target = p ? Number(p.target_count) : 0;
          const passed = p ? Number(p.passed) : 0;
          const expected = expectedPassed(new Date(), weeks, target);
          const status = paceStatus(passed, expected);
          // The student's OWN run — a returning student's start_surah is not
          // 114, so indexing the global list here would name the wrong surah.
          const next = memorisationList(
            Number(p?.start_surah ?? 114),
            target,
            surahs as Surah[],
          )[passed];
          return (
            <li key={s.id}>
              <Link href={`/teacher/hifz/${s.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/60">
                <span className="min-w-0">
                  <span className="text-sm font-medium">{s.full_name}</span>
                  {next && (
                    <span className="ml-2 text-xs text-muted-foreground">next: {next.name_en}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {passed}/{target || "—"} · expected {expected}
                  </span>
                  <span className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    !p && "bg-muted text-muted-foreground",
                    p && status === "ok" && "bg-ok/12 text-ok",
                    p && status === "warn" && "bg-warn/12 text-warn",
                    p && status === "danger" && "bg-danger/12 text-danger",
                  )}>
                    {!p ? "no target" : status === "ok" ? "ahead" : status === "warn" ? "on pace" : "behind"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {students.length === 0 && (
        <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
          No active students yet.
        </p>
      )}
    </div>
  );
}
