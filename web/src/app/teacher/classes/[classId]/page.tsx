import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getIndividualLeaderboard } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { currentSurah } from "@/lib/teacher/class-progress";
import { canOpenSection } from "@/lib/teacher/scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The same column geometry the roster uses, so a colleague's class reads like
 * your own rather than like a different app.
 */
const COLS = cn(
  "grid-cols-2 items-center gap-x-5 gap-y-3 px-4 lg:px-5",
  "lg:grid-cols-[minmax(0,1.5fr)_4.5rem_7rem_9rem_7rem] lg:gap-x-6 lg:gap-y-0",
);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts.at(-1)![0] ?? "") : "")).toUpperCase();
}

function Cell({
  label, children, className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("min-w-0", className)}>
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground lg:hidden">
        {label}
      </span>
      <span className="mt-0.5 block lg:mt-0">{children}</span>
    </span>
  );
}

/**
 * One class, read only.
 *
 * Reached from the Classes list, and only by a teacher in the same section —
 * the guard below is the one that decides, not the absence of a link on the
 * page before it. Deliberately has none of the roster's controls: no exam
 * entry, no strikes, and the names do not open student records. Those belong
 * to whoever teaches this class, and a colleague looking in wants to know how
 * the class is getting on, not to reach into it.
 */
export default async function ClassDetail({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  const db = await supabaseServer();

  const [profile, { data: cls }, { terms }, lb] = await Promise.all([
    currentProfile(),
    db.from("classes").select("id, name, section, teacher_id").eq("id", classId).maybeSingle(),
    getTermsAndWeeks(),
    getIndividualLeaderboard(),
  ]);

  if (!cls) notFound();
  // Section decides. A brothers' teacher guessing a sisters' class id gets the
  // same nothing the list gave them, rather than a roster they may not read.
  if (!canOpenSection(profile?.section, cls.section)) notFound();

  const termId = currentTermId(terms);

  const [{ data: students }, { data: teacher }] = await Promise.all([
    db
      .from("profiles")
      .select("id, full_name, is_active")
      .eq("role", "student")
      .eq("class_id", cls.id)
      .order("full_name"),
    cls.teacher_id
      ? db.from("profiles").select("full_name").eq("id", cls.teacher_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ids = (students ?? []).map((s) => s.id);

  const [{ data: eoys }, { data: hifz }, { data: strikes }, { data: records }, surahs] =
    await Promise.all([
      ids.length ? db.from("v_eoy").select("student_id, eoy_pct").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("strikes").select("student_id").in("student_id", ids).eq("term_id", termId) : Promise.resolve({ data: [] }),
      ids.length ? db.from("hifz_records").select("student_id, surah_number").in("student_id", ids) : Promise.resolve({ data: [] }),
      getCachedSurahs(),
    ]);

  const eoyMap = new Map((eoys ?? []).map((r) => [r.student_id!, Number(r.eoy_pct)]));
  const hifzMap = new Map((hifz ?? []).map((r) => [r.student_id!, r]));
  const rankMap = new Map(lb.map((r) => [r.name, r.rank]));
  const strikeCount = new Map<string, number>();
  for (const s of strikes ?? []) {
    strikeCount.set(s.student_id, (strikeCount.get(s.student_id) ?? 0) + 1);
  }

  const passedOf = new Map<string, Set<number>>();
  for (const r of records ?? []) {
    const set = passedOf.get(r.student_id) ?? new Set<number>();
    set.add(r.surah_number);
    passedOf.set(r.student_id, set);
  }

  // The surah a student is ON — first in their own run not yet signed off,
  // never the deepest record. Same definition the roster and the register use.
  const surahFor = (studentId: string) => {
    const h = hifzMap.get(studentId);
    if (!h) return null;
    const run = memorisationList(Number(h.start_surah), Number(h.target_count), surahs as Surah[]);
    return currentSurah(run, passedOf.get(studentId) ?? new Set<number>());
  };

  const active = (students ?? []).filter((s) => s.is_active).length;

  return (
    <>
      <header className="masthead">
        <Link href="/teacher/classes" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Back to Classes
        </Link>
        <h1><b>{cls.name}</b></h1>
        <p>
          {teacher?.full_name ?? "No teacher assigned"} · {active} student{active === 1 ? "" : "s"}
          {" · read only"}
        </p>
      </header>

      <div className="field">
        <div className="box c12" style={{ padding: 0 }}>
          <div
            className={cn(
              COLS,
              "hidden border-b border-line py-2.5 lg:grid",
              "text-[10px] uppercase tracking-wider text-muted-foreground",
            )}
          >
            <span>Student</span>
            <span>Rank</span>
            <span>Strikes · T{termId}</span>
            <span>Hifdh</span>
            <span className="lg:text-right">Overall</span>
          </div>

          <ul className="divide-y divide-line">
            {(students ?? []).map((s) => {
              const h = hifzMap.get(s.id);
              const taken = strikeCount.get(s.id) ?? 0;
              const eoy = eoyMap.get(s.id);
              const rank = rankMap.get(s.full_name);
              const on = surahFor(s.id);
              return (
                <li
                  key={s.id}
                  className={cn(COLS, "grid py-3.5", !s.is_active && "opacity-50")}
                >
                  <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full",
                        "bg-foreground/10 text-[11px] font-semibold tracking-wide text-ink-2",
                      )}
                    >
                      {initials(s.full_name)}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium">
                      {s.full_name}
                      {!s.is_active && (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </span>
                  </span>

                  <Cell label="Rank">
                    <span className="font-heading text-lg leading-none tabular-nums">
                      {rank ?? <span className="text-muted-foreground/50">—</span>}
                    </span>
                  </Cell>

                  <Cell label="Strikes">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className={cn(
                              "size-2",
                              i < taken ? (taken >= 2 ? "bg-danger" : "bg-warn") : "bg-foreground/15",
                            )}
                          />
                        ))}
                      </span>
                      <span
                        className={cn(
                          "text-xs tabular-nums",
                          taken >= 2 ? "text-danger" : "text-muted-foreground",
                        )}
                      >
                        {taken} of 3
                      </span>
                    </span>
                  </Cell>

                  <Cell label="Hifdh">
                    <span className="text-sm tabular-nums">
                      {h ? (
                        <>
                          {h.passed}
                          <span className="text-muted-foreground"> / {h.target_count}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </span>
                    {h && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {on ? on.name_en : "target complete"}
                      </span>
                    )}
                  </Cell>

                  <Cell label="Overall" className="text-left lg:text-right">
                    <span
                      className={cn(
                        "font-heading text-lg leading-none tabular-nums",
                        eoy === undefined && "text-muted-foreground/50",
                      )}
                    >
                      {eoy === undefined ? "—" : `${eoy.toFixed(1)}%`}
                    </span>
                  </Cell>
                </li>
              );
            })}
          </ul>

          {!students?.length && <p className="empty">No students in this class yet.</p>}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        A colleague&rsquo;s class, so this page reads and nothing more — marks, strikes and hifdh
        sign-off stay with the teacher who takes it. Overall is the year to date: each term is
        80% exam and 20% homework. Strikes are for Term {termId} only.
      </p>
    </>
  );
}
