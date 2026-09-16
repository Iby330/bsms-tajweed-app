import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MISTAKE_COLS, type MistakeRow } from "./mistakes";
import type { HearingRange } from "./hearings";

export type Hearing = HearingRange & {
  id: string;
  submittedAt: string;
  note: string | null;
  teacherName: string;
  mistakes: MistakeRow[];   // of ONE surah when read through hearingsFor; empty from hearingsForStudent
};

type HearingSessionRow = {
  id: string; reviewer_id: string; submitted_at: string | null;
  surah_number: number | null; to_surah_number: number | null; overall_note: string | null;
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
  submittedAt: s.submitted_at!,
  note: s.overall_note,
  teacherName: names.get(s.reviewer_id) ?? "your teacher",
  mistakes,
});

const HEARING_COLS = "id, reviewer_id, submitted_at, surah_number, to_surah_number, overall_note";

type Db = Awaited<ReturnType<typeof supabaseServer>>;

/**
 * The base of every read here: a submitted hearing of this student —
 * kind='hearing', reciter_id=studentId, submitted_at not null. Callers
 * layer their own range filters and ordering on top.
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
 * what the grids need to draw heard-not-passed cells. Reads run as the
 * caller: a student sees only submitted rows.
 */
export async function hearingsForStudent(studentId: string): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data } = await submittedHearings(db, studentId, HEARING_COLS)
    .order("submitted_at", { ascending: false });
  const rows = (data ?? []) as HearingSessionRow[];
  const names = await namesFor([...new Set(rows.map((r) => r.reviewer_id))]);
  return rows.map((r) => toHearing(r, names, []));
}

/** Every mistake of every submitted hearing of a student — the desk's heat. */
export async function hearingMistakesFor(studentId: string): Promise<MistakeRow[]> {
  const db = await supabaseServer();
  const { data: sessions } = await submittedHearings(db, studentId, "id");
  const ids = (sessions ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids);
  return (data ?? []) as MistakeRow[];
}

/**
 * Submitted hearings whose range covers one surah, newest first, each with
 * ITS mistakes on that surah only — a range hearing's marks on the
 * neighbouring surahs belong to those surahs' pages.
 */
export async function hearingsFor(studentId: string, surah: number): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data: sessions } = await submittedHearings(db, studentId, HEARING_COLS)
    .gte("surah_number", surah).lte("to_surah_number", surah)
    .order("submitted_at", { ascending: false });
  const rows = (sessions ?? []) as HearingSessionRow[];
  if (!rows.length) return [];
  const ids = rows.map((s) => s.id);
  const [{ data: mistakes }, names] = await Promise.all([
    db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids).eq("surah_number", surah),
    namesFor([...new Set(rows.map((s) => s.reviewer_id))]),
  ]);
  const all = (mistakes ?? []) as MistakeRow[];
  return rows.map((s) => toHearing(s, names, all.filter((m) => m.session_id === s.id)));
}

/**
 * The teacher's open draft on this student, wherever it started, with its
 * marks. One open draft per teacher per student: the desk resumes it and
 * the per-surah page defers to it. `teacherId` must be the signed-in
 * teacher's own id (the page passes profile.id); RLS lets a teacher read
 * every session, so it will not catch a mismatch. If a race ever leaves
 * two open drafts, the oldest wins rather than crashing the page.
 */
export async function openDraftFor(
  teacherId: string, studentId: string,
): Promise<{ id: string; from: number; mistakes: MistakeRow[] } | null> {
  const db = await supabaseServer();
  const { data: s } = await db
    .from("revision_sessions").select("id, surah_number")
    .eq("reviewer_id", teacherId).eq("reciter_id", studentId).eq("kind", "hearing")
    .is("submitted_at", null)
    .order("started_at", { ascending: true }).limit(1).maybeSingle();
  if (!s || s.surah_number === null) return null;
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).eq("session_id", s.id);
  return { id: s.id, from: s.surah_number, mistakes: (data ?? []) as MistakeRow[] };
}
