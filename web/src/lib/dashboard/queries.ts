import { supabaseServer } from "@/lib/supabase/server";

/** Shared server-side reads. Every grade number comes from a view — the
 *  verified formulas live in SQL and are never recomputed in JS. */

export async function getTermsAndWeeks() {
  const db = await supabaseServer();
  const [{ data: terms }, { data: weeks }] = await Promise.all([
    db.from("terms").select("id, starts_on, ends_on, exam_max").order("id"),
    db.from("weeks").select("id, term_id, number, unlock_at").order("term_id").order("number"),
  ]);
  return { terms: terms ?? [], weeks: weeks ?? [] };
}

/** The week currently in progress: latest unlocked week. */
export function currentWeek<T extends { unlock_at: string }>(weeks: T[], now = new Date()): T | null {
  const unlocked = weeks.filter((w) => Date.parse(w.unlock_at) <= now.getTime());
  return unlocked.length ? unlocked[unlocked.length - 1] : null;
}

export function currentTermId(
  terms: { id: number; starts_on: string; ends_on: string }[],
  now = new Date(),
): number {
  const t = terms.find(
    (x) => Date.parse(x.starts_on) <= now.getTime() && now.getTime() <= Date.parse(x.ends_on),
  );
  if (t) return t.id;
  // between terms → the most recent one that has started
  const started = terms.filter((x) => Date.parse(x.starts_on) <= now.getTime());
  return started.length ? started[started.length - 1].id : 1;
}

export async function getStudentProgress(studentId: string, termId: number) {
  const db = await supabaseServer();
  const [avg, term, eoy, hifz, strikes] = await Promise.all([
    db.from("v_termly_avg").select("hw_avg").eq("student_id", studentId).eq("term_id", termId).maybeSingle(),
    db.from("v_term_pct").select("term_pct").eq("student_id", studentId).eq("term_id", termId).maybeSingle(),
    db.from("v_eoy").select("eoy_pct").eq("student_id", studentId).maybeSingle(),
    db.from("v_hifz_progress").select("passed, target_count, start_surah, pct").eq("student_id", studentId).maybeSingle(),
    db.from("strikes").select("reason, note, issued_at").eq("student_id", studentId).eq("term_id", termId).order("issued_at"),
  ]);
  return {
    hwAvg: avg.data?.hw_avg ? Number(avg.data.hw_avg) : null,
    termPct: term.data?.term_pct ? Number(term.data.term_pct) : null,
    eoyPct: eoy.data?.eoy_pct ? Number(eoy.data.eoy_pct) : null,
    hifz: hifz.data
      ? {
          passed: Number(hifz.data.passed),
          target: Number(hifz.data.target_count),
          startSurah: Number(hifz.data.start_surah),
        }
      : null,
    strikes: strikes.data ?? [],
  };
}

export async function getIndividualLeaderboard() {
  const db = await supabaseServer();
  const { data } = await db
    .from("v_lb_individual")
    .select("full_name, class_name, pct, rank")
    .order("rank");
  return (data ?? []).map((r) => ({
    name: r.full_name as string,
    className: r.class_name as string,
    pct: Number(r.pct),
    rank: Number(r.rank),
  }));
}

export async function getClassLeaderboards() {
  const db = await supabaseServer();
  const [hw, hifz] = await Promise.all([
    db.from("v_lb_class").select("class_name, pct, rank").order("rank"),
    db.from("v_lb_hifz_class").select("class_name, pct, rank").order("rank"),
  ]);
  const map = (rows: { class_name: unknown; pct: unknown; rank: unknown }[] | null) =>
    (rows ?? []).map((r) => ({
      name: String(r.class_name),
      pct: Number(r.pct),
      rank: Number(r.rank),
    }));
  return { homework: map(hw.data), hifz: map(hifz.data) };
}
