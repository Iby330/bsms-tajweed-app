import type { ReactNode } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { scopeLabel, teacherClass } from "@/lib/teacher/scope";
import { rosterWithNext } from "@/lib/hifz/roster";
import { timetableFor, weekdayNameFor } from "@/lib/attendance/calendar";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { HifzRegister, type RegisterRow } from "@/components/app/hifz-register";
import { PairingPanel, type PairRow, type UnpairedStudent } from "@/components/app/pairing-panel";
import { HifzTabs } from "@/components/app/hifz-tabs";
import { HearTab } from "@/components/app/hear-tab";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "hear", label: "Hear" },
];

/**
 * The hifdh register: Overview (the class, targets, Pass / Not passed on
 * each row, the revision pairs) and Hear (`?tab=hear`), where the teacher
 * picks a student and marks their mistakes as they recite.
 */
export default async function TeacherHifz({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; student?: string; p?: string; heat?: string }>;
}) {
  const { tab, student, p, heat } = await searchParams;
  const hear = tab === "hear";
  const db = await supabaseServer();

  // The label and the roster both hang off the same cached class read, so
  // firing them together costs one class round trip rather than two.
  // (The Hear tab reads the roster itself; this read is then cached.)
  const [{ weeksFor }, label, roster, mine] = await Promise.all([
    getTermsAndWeeks(),
    scopeLabel(),
    rosterWithNext(),
    teacherClass(),
  ]);
  // Which weekday hifdh falls on is a fact about the class, not the
  // programme, and the sisters settle theirs each year.
  const recitationDay = weekdayNameFor(
    timetableFor(mine?.section ?? "brothers", mine?.name),
    "hifdh",
  );
  // the class's section's calendar, so pace matches what its students see
  const weeks = weeksFor(mine?.section);

  // The masthead and the tabs are the same on both tabs.
  const shell = (body: ReactNode) => (
    <>
      <header className="masthead">
        <h1><span>Hifdh register</span></h1>
        <p>
          {hear
            ? `${label} · ${recitationDay} recitation. Pick who is reciting and tap the words they get wrong.`
            : `${label} · ${recitationDay} recitation. Colour shows each student against the calendar. Select students to set their target.`}
        </p>
      </header>

      <HifzTabs basePath="/teacher/hifdh" active={hear ? "hear" : "overview"} tabs={TABS} />

      {body}
    </>
  );

  if (hear) return shell(<HearTab studentParam={student} p={p} heat={heat} roster={roster} />);

  const ids = roster.map((s) => s.id);

  const [surahs, { data: pairRows }] = await Promise.all([
    getCachedSurahs(),
    ids.length
      ? db.from("revision_pairs").select("id, student_a, student_b").eq("active", true)
          .or(`student_a.in.(${ids.join(",")}),student_b.in.(${ids.join(",")})`)
      : Promise.resolve({ data: [] as { id: string; student_a: string; student_b: string }[] }),
  ]);
  const run = memorisationList(114, (surahs as Surah[]).length, surahs as Surah[]);
  const now = new Date();

  const nameOf = new Map(roster.map((s) => [s.id, s.name]));
  const pairs: PairRow[] = (pairRows ?? []).map((p) => ({
    id: p.id,
    label: `${nameOf.get(p.student_a) ?? "?"} ↔ ${nameOf.get(p.student_b) ?? "?"}`,
  }));
  const pairedIds = new Set((pairRows ?? []).flatMap((p) => [p.student_a, p.student_b]));
  const unpaired: UnpairedStudent[] = roster
    .filter((s) => !pairedIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name }));

  const rows: RegisterRow[] = roster.map((s) => ({
    studentId: s.id,
    name: s.name,
    nextName: s.next?.name_en ?? null,
    passed: s.passed,
    target: s.target,
    expected: expectedPassed(now, weeks, s.target),
    // No target set reads the same as before rosterWithNext: target 0 → no pace.
    pace: s.target > 0 ? paceStatus(s.passed, expectedPassed(now, weeks, s.target)) : null,
    startSurah: s.startSurah,
    run: s.run.map((r) => r.number),
    // The result popup opens at the next unpassed surah, or a completed
    // run's last.
    from: s.run.length ? (s.next?.number ?? s.run[s.run.length - 1].number) : null,
    passedBefore: s.passedAt,
  }));

  return shell(
    <>
      <PairingPanel pairs={pairs} unpaired={unpaired} />

      {rows.length ? (
        <HifzRegister rows={rows} surahs={run} />
      ) : (
        <p className="box c12  p-6 text-sm text-muted-foreground">
          No active students yet.
        </p>
      )}
    </>,
  );
}
