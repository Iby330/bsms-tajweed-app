import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { scopeLabel, teacherClass } from "@/lib/teacher/scope";
import { rosterWithNext } from "@/lib/hifz/roster";
import { timetableFor, weekdayNameFor } from "@/lib/attendance/calendar";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { HifzRegister, type RegisterRow } from "@/components/app/hifz-register";
import { PairingPanel, type PairRow, type UnpairedStudent } from "@/components/app/pairing-panel";
import { TeacherHifdhTabs } from "@/components/app/teacher-hifdh-tabs";

export const dynamic = "force-dynamic";

export default async function TeacherHifz() {
  const db = await supabaseServer();

  // The label and the roster both hang off the same cached class read, so
  // firing them together costs one class round trip rather than two.
  const [{ weeks }, label, roster, mine] = await Promise.all([
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
  }));

  return (
    <>
      <header className="masthead">
        <h1><span>Hifdh register</span></h1>
        <p>
          {label} · {recitationDay} recitation. Colour shows each student against the calendar.
          Select students to set their target.
        </p>
      </header>

      <div className="mb-6">
        <TeacherHifdhTabs active="overview" />
      </div>

      <PairingPanel pairs={pairs} unpaired={unpaired} />

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
