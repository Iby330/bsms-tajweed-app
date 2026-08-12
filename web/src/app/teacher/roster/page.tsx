import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getIndividualLeaderboard } from "@/lib/dashboard/queries";
import { scopeLabel, teacherClass } from "@/lib/teacher/scope";
import { ExamInput } from "@/components/app/exam-input";
import { StrikeManager, type StudentStrike } from "@/components/app/strike-manager";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

  const [{ data: avgs }, { data: termPcts }, { data: eoys }, { data: hifz }, { data: strikes }, { data: exams }] =
    await Promise.all([
      ids.length ? db.from("v_termly_avg").select("student_id, term_id, hw_avg").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("v_term_pct").select("student_id, term_id, term_pct").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("v_eoy").select("student_id, eoy_pct").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("v_hifz_progress").select("student_id, passed, target_count").in("student_id", ids) : Promise.resolve({ data: [] }),
      ids.length ? db.from("strikes").select("id, student_id, reason, note, issued_at").in("student_id", ids).eq("term_id", termId).order("issued_at") : Promise.resolve({ data: [] }),
      ids.length ? db.from("exam_scores").select("student_id, term_id, score").in("student_id", ids) : Promise.resolve({ data: [] }),
    ]);

  const key = (sid: string, t: number) => `${sid}:${t}`;
  const avgMap = new Map((avgs ?? []).map((r) => [key(r.student_id!, r.term_id!), Number(r.hw_avg)]));
  const termMap = new Map((termPcts ?? []).map((r) => [key(r.student_id!, r.term_id!), Number(r.term_pct)]));
  const eoyMap = new Map((eoys ?? []).map((r) => [r.student_id!, Number(r.eoy_pct)]));
  const hifzMap = new Map((hifz ?? []).map((r) => [r.student_id!, r]));
  const examMap = new Map((exams ?? []).map((r) => [key(r.student_id, r.term_id), Number(r.score)]));
  const rankMap = new Map(lb.map((r) => [r.name, r.rank]));
  const strikesByStudent = new Map<string, StudentStrike[]>();
  for (const s of strikes ?? []) {
    const list = strikesByStudent.get(s.student_id) ?? [];
    list.push({ id: s.id, reason: s.reason, note: s.note, issued_at: s.issued_at! });
    strikesByStudent.set(s.student_id, list);
  }

  const pct = (n: number | undefined) => (n === undefined ? "—" : `${n.toFixed(1)}%`);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl">Roster</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {label} · everything that used to live in the spreadsheet.
        </p>
      </header>

      <div className="overflow-x-auto glass rounded-2xl">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-2 py-2.5 text-right font-medium">Rank</th>
              {terms.map((t) => (
                <th key={t.id} className="px-2 py-2.5 text-right font-medium">HW T{t.id}</th>
              ))}
              {terms.map((t) => (
                <th key={t.id} className="px-2 py-2.5 text-right font-medium">Exam T{t.id}</th>
              ))}
              {terms.map((t) => (
                <th key={t.id} className="px-2 py-2.5 text-right font-medium">Term {t.id}</th>
              ))}
              <th className="px-2 py-2.5 text-right font-medium">EOY</th>
              <th className="px-2 py-2.5 text-right font-medium">Hifz</th>
              <th className="px-4 py-2.5 text-right font-medium">Strikes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(students ?? []).map((s) => {
              const h = hifzMap.get(s.id);
              const studentStrikes = strikesByStudent.get(s.id) ?? [];
              return (
                <tr key={s.id} className={cn(!s.is_active && "opacity-50")}>
                  <td className="px-4 py-2 font-medium">
                    {s.full_name}
                    {!s.is_active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                    {rankMap.get(s.full_name) ?? "—"}
                  </td>
                  {terms.map((t) => (
                    <td key={t.id} className="px-2 py-2 text-right tabular-nums">
                      {pct(avgMap.get(key(s.id, t.id)))}
                    </td>
                  ))}
                  {terms.map((t) => (
                    <td key={t.id} className="px-2 py-2 text-right">
                      <ExamInput studentId={s.id} termId={t.id} max={t.exam_max}
                        initial={examMap.get(key(s.id, t.id)) ?? null} />
                    </td>
                  ))}
                  {terms.map((t) => (
                    <td key={t.id} className="px-2 py-2 text-right font-medium tabular-nums">
                      {pct(termMap.get(key(s.id, t.id)))}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{pct(eoyMap.get(s.id))}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {h ? `${h.passed}/${h.target_count}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <StrikeManager
                      studentId={s.id}
                      studentName={s.full_name}
                      termId={termId}
                      strikes={studentStrikes}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Term % is 80% exam and 20% homework. Unsubmitted homework is excluded from the average, not counted as zero.
      </p>
    </div>
  );
}
