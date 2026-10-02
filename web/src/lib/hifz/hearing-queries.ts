import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MISTAKE_COLS, type MistakeRow } from "./mistakes";
import { todaysSession, type HearingRange } from "./hearings";

export type Hearing = HearingRange & {
  id: string;
  /** False for a Hear tab marking session: marks, no result. */
  countsAsResult: boolean;
  submittedAt: string;
  note: string | null;
  teacherName: string;
  mistakes: MistakeRow[];   // of ONE surah when read through hearingsFor; empty from hearingsForStudent
};

type HearingSessionRow = {
  id: string; reviewer_id: string; submitted_at: string | null;
  surah_number: number | null; to_surah_number: number | null; overall_note: string | null;
  counts_as_result: boolean;
};

/** Reviewer names go through the admin client: profiles are not cross-readable. */
async function namesFor(reviewerIds: string[]): Promise<Map<string, string>> {
  if (!reviewerIds.length) return new Map();
  const { data } = await supabaseAdmin().from("profiles").select("id, full_name").in("id", reviewerIds);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

// surah_number / to_surah_number are nullable columns, but every caller here
// filters kind='hearing' and submitted_at not null, and the 0029/0030
// migrations' check constraints tie exactly those two conditions to both
// columns being non-null — so the `!` assertions below never fire.
const toHearing = (s: HearingSessionRow, names: Map<string, string>, mistakes: MistakeRow[]): Hearing => ({
  id: s.id,
  from: s.surah_number!,
  to: s.to_surah_number!,
  countsAsResult: s.counts_as_result,
  submittedAt: s.submitted_at!,
  note: s.overall_note,
  teacherName: names.get(s.reviewer_id) ?? "your teacher",
  mistakes,
});

const HEARING_COLS =
  "id, reviewer_id, submitted_at, surah_number, to_surah_number, overall_note, counts_as_result";

type Db = Awaited<ReturnType<typeof supabaseServer>>;

/**
 * The base of every read here: a submitted hearing of this student —
 * kind='hearing', reciter_id=studentId, submitted_at not null. Both kinds
 * come back, results and marking sessions (submitted from their first
 * mark), so every reader that shows marks shows both; the state rule in
 * hearings.ts counts only the results. Callers layer their own range
 * filters and ordering on top.
 */
function submittedHearings<Cols extends string>(db: Db, studentId: string, cols: Cols) {
  return db
    .from("revision_sessions")
    .select(cols)
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .not("submitted_at", "is", null);
}

/**
 * Every submitted hearing of a student, newest first, WITHOUT mistakes —
 * what the grids need to draw heard-not-passed cells (heardSurahs and
 * surahState skip the marking sessions by `countsAsResult`). Reads run as
 * the caller: a student sees only submitted rows.
 */
export async function hearingsForStudent(studentId: string): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data } = await submittedHearings(db, studentId, HEARING_COLS)
    .order("submitted_at", { ascending: false });
  const rows = (data ?? []) as HearingSessionRow[];
  const names = await namesFor([...new Set(rows.map((r) => r.reviewer_id))]);
  return rows.map((r) => toHearing(r, names, []));
}

/** Every mistake of every submitted hearing of a student: the Hear tab's heat and its recurring mistakes. */
export async function hearingMistakesFor(studentId: string): Promise<MistakeRow[]> {
  const db = await supabaseServer();
  const { data: sessions } = await submittedHearings(db, studentId, "id");
  const ids = (sessions ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids);
  return (data ?? []) as MistakeRow[];
}

/**
 * Submitted hearings about one surah, newest first, each with ITS mistakes
 * on that surah only — a range hearing's marks on the neighbouring surahs
 * belong to those surahs' pages. Results come when their range covers the
 * surah; a marking session's range is only the surah of its first mark, so
 * those come whenever they hold a mark on this surah.
 */
export async function hearingsFor(studentId: string, surah: number): Promise<Hearing[]> {
  if (!Number.isInteger(surah)) return [];
  const db = await supabaseServer();
  const { data: sessions } = await submittedHearings(db, studentId, HEARING_COLS)
    .or(`counts_as_result.eq.false,and(surah_number.gte.${surah},to_surah_number.lte.${surah})`)
    .order("submitted_at", { ascending: false });
  const rows = (sessions ?? []) as HearingSessionRow[];
  if (!rows.length) return [];
  const ids = rows.map((s) => s.id);
  const [{ data: mistakes }, names] = await Promise.all([
    db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids).eq("surah_number", surah),
    namesFor([...new Set(rows.map((s) => s.reviewer_id))]),
  ]);
  const all = (mistakes ?? []) as MistakeRow[];
  return rows
    .map((s) => toHearing(s, names, all.filter((m) => m.session_id === s.id)))
    .filter((h) => h.countsAsResult || h.mistakes.length > 0);
}

/**
 * Today's marking session of this teacher on this student, with its marks:
 * what the Hear tab's logger opens with, so a word marked today can be
 * changed or removed. Today is the UK's (see todaysSession), and the match
 * is the one logHearingMistake writes into. `teacherId` must be the signed-in
 * teacher's own id (the page passes profile.id); RLS lets a teacher read
 * every session, so it will not catch a mismatch.
 */
export async function todaysMarksFor(
  teacherId: string, studentId: string,
): Promise<{ id: string; mistakes: MistakeRow[] } | null> {
  const db = await supabaseServer();
  const session = await todaysMarkingSession(db, teacherId, studentId);
  if (!session) return null;
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).eq("session_id", session.id);
  return { id: session.id, mistakes: (data ?? []) as MistakeRow[] };
}

/**
 * The teacher's marking session on this student for today's UK date, if
 * one exists. Shared by the Hear tab's read and logHearingMistake's write,
 * so both agree on which session "today" is. Two days back covers any
 * offset between UTC and London.
 */
export async function todaysMarkingSession(
  db: Db, teacherId: string, studentId: string, now = new Date(),
): Promise<{ id: string; started_at: string } | null> {
  const { data } = await db
    .from("revision_sessions").select("id, started_at")
    .eq("reviewer_id", teacherId).eq("reciter_id", studentId)
    .eq("kind", "hearing").eq("counts_as_result", false)
    .gte("started_at", new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString());
  return todaysSession(data ?? [], now);
}
