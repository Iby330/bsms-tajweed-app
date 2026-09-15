import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MISTAKE_COLS, type MistakeRow } from "./mistakes";
import type { HearingOutcome } from "./hearings";

export type Hearing = {
  id: string;
  submittedAt: string;
  outcome: HearingOutcome | null;
  note: string | null;
  teacherName: string;
  mistakes: MistakeRow[];
};

/**
 * Submitted hearings of one surah for one student, newest first. Reads run
 * as the CALLER, so RLS decides what comes back: a student sees only
 * submitted rows, a teacher sees the cohort. The teacher's name goes through
 * the admin client because profiles are not cross-readable.
 */
export async function hearingsFor(studentId: string, surah: number): Promise<Hearing[]> {
  const db = await supabaseServer();
  const { data: sessions } = await db
    .from("revision_sessions")
    .select("id, reviewer_id, submitted_at, outcome, overall_note")
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .eq("surah_number", surah)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  if (!sessions?.length) return [];

  const ids = sessions.map((s) => s.id);
  const [{ data: mistakes }, { data: names }] = await Promise.all([
    db.from("revision_mistakes").select(MISTAKE_COLS).in("session_id", ids),
    supabaseAdmin()
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(sessions.map((s) => s.reviewer_id))]),
  ]);
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name]));
  const rows = (mistakes ?? []) as MistakeRow[];
  return sessions.map((s) => ({
    id: s.id,
    submittedAt: s.submitted_at!,
    outcome: (s.outcome as HearingOutcome | null) ?? null,
    note: s.overall_note,
    teacherName: nameOf.get(s.reviewer_id) ?? "your teacher",
    mistakes: rows.filter((m) => m.session_id === s.id),
  }));
}

/**
 * The teacher's own open draft on this surah, with its marks, or null.
 *
 * `teacherId` must be the signed-in teacher's own id (the page passes
 * `profile.id`); RLS will not catch a mismatch the way it does for a
 * student, because teachers read every session.
 */
export async function draftHearing(
  teacherId: string,
  studentId: string,
  surah: number,
): Promise<{ id: string; mistakes: MistakeRow[] } | null> {
  const db = await supabaseServer();
  const { data: s } = await db
    .from("revision_sessions")
    .select("id")
    .eq("reviewer_id", teacherId)
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .eq("surah_number", surah)
    .is("submitted_at", null)
    .maybeSingle();
  if (!s) return null;
  const { data } = await db.from("revision_mistakes").select(MISTAKE_COLS).eq("session_id", s.id);
  return { id: s.id, mistakes: (data ?? []) as MistakeRow[] };
}
