import { supabaseServer } from "@/lib/supabase/server";
import { expectedPassed, paceStatus, type Surah } from "@/lib/hifz/pace";
import { lastPassedSurah, type ClassRow } from "@/lib/teacher/class-progress";

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

/**
 * What Home needs: the figures a student can act on *today*.
 *
 * Deliberately does NOT read v_term_pct or v_eoy. Both inner-join
 * `exam_scores`, so mid-term they return no row at all and rendered as two
 * permanently blank tiles for most of the year. Those end-of-term figures
 * live on the Progress tab, in a table that has room to explain why they are
 * empty. Home answers "what do I need to do now"; Progress answers "how has
 * the year gone".
 */
export async function getStudentProgress(studentId: string, termId: number) {
  const db = await supabaseServer();
  const [avg, hifz, strikes] = await Promise.all([
    db.from("v_termly_avg").select("hw_avg").eq("student_id", studentId).eq("term_id", termId).maybeSingle(),
    db.from("v_hifz_progress").select("passed, target_count, start_surah, pct").eq("student_id", studentId).maybeSingle(),
    db.from("strikes").select("reason, note, issued_at").eq("student_id", studentId).eq("term_id", termId).order("issued_at"),
  ]);
  return {
    hwAvg: avg.data?.hw_avg ? Number(avg.data.hw_avg) : null,
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

/** Per-term marks for the Progress tab. `getStudentProgress` answers "how am I
 *  doing right now"; this answers "how has the whole year gone". */
export type TermProgress = {
  termId: number;
  examMax: number;
  hwAvg: number | null;
  termPct: number | null;
  examScore: number | null;
};

export async function getFullProgress(studentId: string) {
  const db = await supabaseServer();
  const [terms, avgs, pcts, exams, eoy, hifz, strikes] = await Promise.all([
    db.from("terms").select("id, exam_max").order("id"),
    db.from("v_termly_avg").select("term_id, hw_avg").eq("student_id", studentId),
    db.from("v_term_pct").select("term_id, term_pct").eq("student_id", studentId),
    db.from("exam_scores").select("term_id, score").eq("student_id", studentId),
    db.from("v_eoy").select("eoy_pct").eq("student_id", studentId).maybeSingle(),
    db.from("v_hifz_progress").select("passed, target_count, start_surah, pct")
      .eq("student_id", studentId).maybeSingle(),
    db.from("strikes").select("term_id, reason, note, issued_at")
      .eq("student_id", studentId).order("issued_at"),
  ]);

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  // views expose term_id as nullable — drop any row that lost its term
  const byTerm = <T extends { term_id: number | null }>(rows: T[] | null) =>
    new Map<number, T>(
      (rows ?? [])
        .filter((r) => r.term_id !== null)
        .map((r) => [r.term_id as number, r] as const),
    );

  const avgMap = byTerm(avgs.data);
  const pctMap = byTerm(pcts.data);
  const examMap = byTerm(exams.data);

  return {
    terms: (terms.data ?? []).map(
      (t): TermProgress => ({
        termId: t.id,
        examMax: t.exam_max,
        hwAvg: num(avgMap.get(t.id)?.hw_avg),
        termPct: num(pctMap.get(t.id)?.term_pct),
        examScore: num(examMap.get(t.id)?.score),
      }),
    ),
    eoyPct: num(eoy.data?.eoy_pct),
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
    .select("full_name, class_name, pct, rank, class_rank")
    .order("rank");
  return (data ?? []).map((r) => ({
    name: r.full_name as string,
    className: r.class_name as string,
    pct: Number(r.pct),
    rank: Number(r.rank),
    classRank: Number(r.class_rank),
  }));
}

export type LbRow = { name: string; pct: number; rank: number };

/**
 * The two toggleable leaderboards on Home.
 *
 * Both ranks come from SQL — the cohort scope reads `rank`, the class scope
 * reads `class_rank`. Narrowing a cohort list to one class in JS would leave
 * ranks 3, 7, 12 with no 1st place, and renumbering them here would move a
 * standing calculation out of the database. Filtering is all that happens.
 */
export async function getHomeLeaderboards(classId: string | null) {
  const db = await supabaseServer();
  const [hwInd, hifzInd, hifzClass, cls] = await Promise.all([
    db.from("v_lb_individual").select("full_name, class_name, pct, rank, class_rank").order("rank"),
    db.from("v_lb_hifz_individual").select("full_name, class_name, pct, rank, class_rank").order("rank"),
    db.from("v_lb_hifz_class").select("class_name, pct, rank").order("rank"),
    classId
      ? db.from("classes").select("name").eq("id", classId).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);

  const myClass = cls.data?.name ?? null;

  type IndRow = { full_name: unknown; class_name: unknown; pct: unknown; rank: unknown; class_rank: unknown };
  const cohort = (rows: IndRow[] | null): LbRow[] =>
    (rows ?? []).map((r) => ({
      name: String(r.full_name),
      pct: Number(r.pct),
      rank: Number(r.rank),
    }));
  const withinClass = (rows: IndRow[] | null): LbRow[] =>
    (rows ?? [])
      .filter((r) => myClass !== null && String(r.class_name) === myClass)
      .map((r) => ({
        name: String(r.full_name),
        pct: Number(r.pct),
        rank: Number(r.class_rank),
      }))
      .sort((a, b) => a.rank - b.rank);

  const classRows = (rows: { class_name: unknown; pct: unknown; rank: unknown }[] | null): LbRow[] =>
    (rows ?? []).map((r) => ({
      name: String(r.class_name),
      pct: Number(r.pct),
      rank: Number(r.rank),
    }));

  return {
    myClass,
    homework: {
      mine: withinClass(hwInd.data),
      cohort: cohort(hwInd.data),
    },
    hifz: {
      mine: withinClass(hifzInd.data),
      classes: classRows(hifzClass.data),
    },
  };
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

/**
 * The dashboard's per-student view of one class.
 *
 * Composes what already exists rather than adding anything: hifz counts from
 * `v_hifz_progress`, the homework mean from `v_termly_avg`, pace from the
 * teaching calendar. No grade is recomputed here.
 *
 * `weeks` and `now` are passed in, not fetched: the caller already has the
 * calendar, and taking `now` as an argument keeps the output deterministic.
 *
 * Only active students. That matches the "Active students" tile rendered
 * directly above the list, so the two can never disagree.
 */
export async function getClassProgress(
  classId: string,
  termId: number,
  weeks: { unlock_at: string }[],
  now = new Date(),
): Promise<ClassRow[]> {
  const db = await supabaseServer();

  const { data: students } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("class_id", classId)
    .eq("role", "student")
    .eq("is_active", true)
    .order("full_name");

  const ids = (students ?? []).map((s) => s.id);
  if (!ids.length) return [];

  const [hifz, records, avgs, surahs] = await Promise.all([
    db.from("v_hifz_progress")
      .select("student_id, passed, target_count, start_surah").in("student_id", ids),
    db.from("hifz_records").select("student_id, surah_number").in("student_id", ids),
    db.from("v_termly_avg")
      .select("student_id, hw_avg").in("student_id", ids).eq("term_id", termId),
    db.from("surahs").select("number, order_index, name_ar, name_en").order("order_index"),
  ]);

  // Views expose every column as nullable — drop any row that lost its key.
  const hifzOf = new Map(
    (hifz.data ?? [])
      .filter((r) => r.student_id !== null)
      .map((r) => [r.student_id as string, r] as const),
  );
  const avgOf = new Map(
    (avgs.data ?? [])
      .filter((r) => r.student_id !== null)
      .map((r) => [r.student_id as string, r.hw_avg] as const),
  );

  const passedOf = new Map<string, Set<number>>();
  for (const r of records.data ?? []) {
    const set = passedOf.get(r.student_id) ?? new Set<number>();
    set.add(r.surah_number);
    passedOf.set(r.student_id, set);
  }

  const allSurahs = (surahs.data ?? []) as Surah[];
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return (students ?? []).map((s): ClassRow => {
    const h = hifzOf.get(s.id);
    const target = Number(h?.target_count ?? 0);
    const passed = Number(h?.passed ?? 0);
    const expected = expectedPassed(now, weeks, target);
    const last = h
      ? lastPassedSurah(
          Number(h.start_surah),
          target,
          allSurahs,
          passedOf.get(s.id) ?? new Set<number>(),
        )
      : null;

    return {
      studentId: s.id,
      name: s.full_name,
      lastPassed: last?.name_en ?? null,
      passed,
      target,
      expected,
      // No hifz profile → no target → nothing to judge them against.
      pace: h ? paceStatus(passed, expected) : null,
      hwAvg: num(avgOf.get(s.id)),
    };
  });
}
