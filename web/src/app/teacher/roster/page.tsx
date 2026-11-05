import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getIndividualLeaderboard } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { currentSurah } from "@/lib/teacher/class-progress";
import { passRecords } from "@/lib/hifz/roster";
import { scopeLabel, teacherClass, teacherClasses } from "@/lib/teacher/scope";
import { sectionsVisibleTo } from "@/lib/sections";
import { RosterNotice, RosterRemove, type MoveOption } from "@/components/app/roster-remove";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The column geometry, declared once so the header and every row apply the
 * same string. Two columns on a tablet, the figures plus Remove on a phone,
 * five plus Remove from `lg`.
 *
 * The last track on a phone and from `lg` is empty inside the row's link: it
 * holds the room for the Remove button, which sits over it (see the row) so
 * that pressing it never follows the link.
 */
const COLS = cn(
  "grid-cols-2 items-center gap-x-5 gap-y-3 px-4 lg:px-5 max-md:grid-cols-[repeat(4,minmax(0,1fr))_4.25rem] max-md:gap-x-2 max-md:gap-y-1.5 max-md:px-3",
  // Hifdh is 9rem rather than 6.5: it carries a surah name under the count
  // now, and the longer ones (Al-Mutaffifin, Al-Ghashiyah) were ellipsised
  // into uselessness at the old width.
  "lg:grid-cols-[minmax(0,1.5fr)_4.5rem_7rem_9rem_7rem_5rem] lg:gap-x-6 lg:gap-y-0",
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
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground lg:hidden max-md:hidden">
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
  let q = db
    .from("profiles")
    .select("id, full_name, is_active, class_id, section")
    .eq("role", "student");
  // An admin's roster is every class they may see, their own among them
  // (see teacherRoster). Everyone else keeps their own class.
  const admin = (await currentProfile())?.is_admin ?? false;
  if (admin) q = q.in("class_id", (await teacherClasses()).map((c) => c.id));
  else if (mine) q = q.eq("class_id", mine.id);
  const [{ data: students }, { data: classRows }] = await Promise.all([
    q.order("full_name"),
    // Every real class, for Remove → Move: where a student can go is their
    // own side minus where they are, worked out per row below.
    db.from("classes").select("id, name, section, teacher_id").in("section", sectionsVisibleTo(mine?.section)).order("name"),
  ]);
  const ids = (students ?? []).map((s) => s.id);
  const teacherIds = (classRows ?? []).map((c) => c.teacher_id).filter((x): x is string => Boolean(x));
  const { data: teacherRows } = teacherIds.length
    ? await db.from("profiles").select("id, full_name").in("id", teacherIds)
    : { data: [] as { id: string; full_name: string }[] };
  const teacherName = new Map((teacherRows ?? []).map((t) => [t.id, t.full_name]));
  const classById = new Map((classRows ?? []).map((c) => [c.id, c]));
  const moveOptions = (section: string, from: string): MoveOption[] =>
    (classRows ?? [])
      .filter((c) => c.section === section && c.id !== from)
      .map((c) => {
        const t = c.teacher_id ? teacherName.get(c.teacher_id) : undefined;
        return { id: c.id, name: c.name, label: t ? `${c.name} · ${t}` : c.name };
      });

  // `hifz_records` and the surah list are what turn "12 of 43" into a surah a
  // teacher can actually say out loud. Both join the wave rather than
  // following it, so naming the surah costs no extra round trip.
  const [{ data: eoys }, { data: hifz }, { data: strikes }, records, surahs] =
    await Promise.all([
      ids.length ? db.from("v_eoy").select("student_id, eoy_pct").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("v_hifz_progress").select("student_id, passed, target_count, start_surah").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("strikes").select("student_id").in("student_id", ids).eq("term_id", termId) : Promise.resolve({ data: [] }),
      // Paged: the whole cohort has well over PostgREST's 1000-row cap.
      ids.length ? passRecords(db, ids) : Promise.resolve([]),
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
  for (const r of records) {
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
        <h1><span>My students</span></h1>
        <p>
          {label} · {students?.length ?? 0} students. Open a name for the full record.
        </p>
      </header>

      <div className="field">
        <div className="box c12" style={{ padding: 0 }}>
          <div
            className={cn(
              COLS,
              "hidden border-b border-line py-2.5 lg:grid max-md:grid max-md:py-2",
              "text-[10px] uppercase tracking-wider text-muted-foreground",
            )}
          >
            {/* On a phone the name has a line of its own, so the header names
                the four figures under it and nothing else. */}
            <span className="max-md:hidden">Student</span>
            <span>Rank</span>
            <span>Strikes<span className="max-md:hidden"> · T{termId}</span></span>
            <span>Hifdh</span>
            {/* The figure below is right-aligned from `lg`, so the heading is
                too — left-aligned here, the two sat visibly out of line. */}
            <span className="lg:text-right">Overall</span>
            <span aria-hidden className="hidden lg:block max-md:block" />
          </div>

          <ul className="divide-y divide-line">
            {(students ?? []).map((s) => {
              const h = hifzMap.get(s.id);
              const taken = strikeCount.get(s.id) ?? 0;
              const eoy = eoyMap.get(s.id);
              const rank = rankMap.get(s.full_name);
              const on = surahFor(s.id);
              // Only someone actually in a class can be taken out of one.
              const cls = s.is_active && s.class_id ? classById.get(s.class_id) : undefined;
              return (
                <li key={s.id} className="relative">
                  <Link
                    href={`/teacher/roster/${s.id}`}
                    className={cn(
                      COLS,
                      "classrow grid py-3.5 max-md:py-2.5",
                      !s.is_active && "opacity-50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                  >
                    <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1 max-md:col-span-5 max-md:gap-2 md:max-lg:pr-24">
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-full max-md:size-7 max-md:text-[10px]",
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
                      <span className="font-heading text-lg leading-none tabular-nums max-md:text-base">
                        {rank ?? <span className="text-muted-foreground/50">–</span>}
                      </span>
                    </Cell>

                    <Cell label="Strikes">
                      <span className="flex items-center gap-2">
                        {/* The dots go on a phone: with Remove on the line
                            there is room for the figure, not both. */}
                        <span aria-hidden className="flex gap-1 max-md:hidden">
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
                            "text-xs whitespace-nowrap tabular-nums max-md:text-[11px]",
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
                          <span className="text-muted-foreground/50">–</span>
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
                          "font-heading text-lg leading-none tabular-nums max-md:text-base",
                          eoy === undefined && "text-muted-foreground/50",
                        )}
                      >
                        {eoy === undefined ? "–" : `${eoy.toFixed(1)}%`}
                      </span>
                    </Cell>
                    {/* The room Remove sits over, on a phone and from lg. */}
                    <span aria-hidden className="hidden lg:block max-md:block" />
                  </Link>
                  {/* Over the link, not in it: a button inside an <a> is
                      invalid, and pressing Remove must not open the record.
                      Phone: bottom right, on the stats line. Tablet: top
                      right, beside the name. From lg: the last column. */}
                  {cls && (
                    <span className="absolute top-3 right-4 lg:top-1/2 lg:right-5 lg:-translate-y-1/2 max-md:top-auto max-md:right-3 max-md:bottom-2">
                      <RosterRemove
                        studentId={s.id}
                        studentName={s.full_name}
                        fromClass={cls.name}
                        options={moveOptions(String(s.section), cls.id)}
                      />
                    </span>
                  )}
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

      <RosterNotice />
    </>
  );
}
