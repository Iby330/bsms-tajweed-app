import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getIndividualLeaderboard } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { currentSurah } from "@/lib/teacher/class-progress";
import { scopeLabel, teacherClass } from "@/lib/teacher/scope";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The column geometry, declared once so the header and every row apply the
 * same string. Two columns on a phone, five from `lg`.
 */
const COLS = cn(
  "grid-cols-2 items-center gap-x-5 gap-y-3 px-4 lg:px-5",
  // Hifdh is 9rem rather than 6.5: it carries a surah name under the count
  // now, and the longer ones (Al-Mutaffifin, Al-Ghashiyah) were ellipsised
  // into uselessness at the old width.
  "lg:grid-cols-[minmax(0,1.5fr)_4.5rem_7rem_9rem_7rem] lg:gap-x-6 lg:gap-y-0",
);

/** Two initials for the identity dot; never throws on a one-word name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts.at(-1)![0] ?? "") : "")).toUpperCase();
}

/** One figure in a row, with its column name repeated only on small screens. */
function Cell({
  label,
  children,
  className,
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
 * The roster — one line per student and nothing more.
 *
 * Five facts: who they are, where they rank, strikes taken, hifdh signed off
 * and the mark the year currently stands at. Everything else that used to be
 * spread across this table — term by term marks, exam entry, the strike
 * record, comments — lives on the student's own page, which the row links to.
 * A table wide enough to hold the year sideways was a spreadsheet with extra
 * steps; a teacher scanning a class wants to find a name, not read a matrix.
 */
export default async function Roster() {
  const db = await supabaseServer();

  // The leaderboard is keyed on nobody and the calendar is cache-served, so
  // neither has any reason to queue behind the class read.
  const [{ terms }, mine, lb] = await Promise.all([
    getTermsAndWeeks(),
    teacherClass(),
    getIndividualLeaderboard(),
  ]);
  const termId = currentTermId(terms);
  const label = await scopeLabel(); // reads the class above, already cached

  // inactive students stay listed here — the roster is the record of the
  // year, and a student who left still has marks worth reading
  let q = db.from("profiles").select("id, full_name, is_active").eq("role", "student");
  if (mine) q = q.eq("class_id", mine.id);
  const { data: students } = await q.order("full_name");
  const ids = (students ?? []).map((s) => s.id);

  // `hifz_records` and the surah list are what turn "12 of 43" into a surah a
  // teacher can actually say out loud. Both join the wave rather than
  // following it, so naming the surah costs no extra round trip.
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

  /**
   * The surah a student is ON — the first in their own run not yet signed off,
   * never the deepest record. Sign-offs land out of order, so the furthest
   * surah passed would name one nobody is reciting on Thursday.
   */
  const surahFor = (studentId: string) => {
    const h = hifzMap.get(studentId);
    if (!h) return null;
    const run = memorisationList(Number(h.start_surah), Number(h.target_count), surahs as Surah[]);
    return currentSurah(run, passedOf.get(studentId) ?? new Set<number>());
  };

  return (
    <>
      <header className="masthead">
        <h1><span>Roster</span></h1>
        <p>
          {label} · {students?.length ?? 0} students. Open a name for the full record.
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
            {/* The figure below is right-aligned from `lg`, so the heading is
                too — left-aligned here, the two sat visibly out of line. */}
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
                <li key={s.id}>
                  <Link
                    href={`/teacher/roster/${s.id}`}
                    className={cn(
                      COLS,
                      "classrow grid py-3.5",
                      !s.is_active && "opacity-50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
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
                                i < taken
                                  ? taken >= 2
                                    ? "bg-danger"
                                    : "bg-warn"
                                  : "bg-foreground/15",
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
                      {/* The count says how far; the name says where. Null once
                          the whole target is passed — there is no surah left
                          to be on, and "done" is the honest word for it. */}
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
                  </Link>
                </li>
              );
            })}
          </ul>

          {!students?.length && <p className="empty">No students in this class yet.</p>}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Overall is the year to date: each term is 80% exam and 20% homework. Strikes are for
        Term {termId} only and reset with the term.
      </p>
    </>
  );
}
