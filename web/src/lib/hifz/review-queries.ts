import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import type { MistakeRow, SessionRow } from "./mistakes";

export type ActivePair = { pairId: string; partnerId: string; partnerName: string };

/** The caller's active revision pair. RLS scopes the pair read to rows naming
 *  them; the partner's NAME goes through the admin client because students
 *  cannot read each other's profiles — the pair row is the authorisation. */
export async function myActivePair(userId: string): Promise<ActivePair | null> {
  const db = await supabaseServer();
  const { data: pair } = await db
    .from("revision_pairs")
    .select("id, student_a, student_b")
    .eq("active", true)
    .or(`student_a.eq.${userId},student_b.eq.${userId}`)
    .maybeSingle();
  if (!pair) return null;
  const partnerId = pair.student_a === userId ? pair.student_b : pair.student_a;
  const { data: partner } = await supabaseAdmin()
    .from("profiles").select("full_name").eq("id", partnerId).maybeSingle();
  return { pairId: pair.id, partnerId, partnerName: partner?.full_name ?? "your partner" };
}

export type RangeSurah = {
  number: number; name_en: string; name_ar: string; passed: boolean; current: boolean;
};

/** The partner's memorised range: passed surahs + the one in progress.
 *  Admin reads — ONLY call with a partnerId that came out of myActivePair(). */
export async function partnerRange(partnerId: string): Promise<RangeSurah[]> {
  const admin = supabaseAdmin();
  const [surahs, { data: hp }, { data: records }] = await Promise.all([
    getCachedSurahs(),
    admin.from("hifz_profiles").select("start_surah, target_count").eq("student_id", partnerId).maybeSingle(),
    admin.from("hifz_records").select("surah_number").eq("student_id", partnerId),
  ]);
  if (!hp) return [];
  const passed = new Set((records ?? []).map((r) => r.surah_number));
  const list = memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]);
  const current = list.find((s) => !passed.has(s.number))?.number ?? null;
  return list
    .filter((s) => passed.has(s.number) || s.number === current)
    .map((s) => ({
      number: s.number, name_en: s.name_en, name_ar: s.name_ar,
      passed: passed.has(s.number), current: s.number === current,
    }));
}

/** The caller's open draft against this reciter, if any. */
export async function myDraftSession(
  reviewerId: string, reciterId: string,
): Promise<{ id: string } | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from("revision_sessions").select("id")
    .eq("reviewer_id", reviewerId).eq("reciter_id", reciterId)
    .is("submitted_at", null)
    .maybeSingle();
  return data ? { id: data.id } : null;
}

export async function draftMistakes(sessionId: string): Promise<MistakeRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("revision_mistakes")
    .select("id, session_id, surah_number, ayah_number, word_position, category, detail, note, created_at")
    .eq("session_id", sessionId);
  return (data ?? []) as MistakeRow[];
}

export type Feedback = {
  sessions: (SessionRow & { reviewerName: string })[];
  mistakes: MistakeRow[];
};

/** Everything submitted about a student. Reads run as the CALLER, so RLS
 *  decides visibility (works for the reciter and for teachers); reviewer
 *  names go through admin because profiles aren't cross-readable. */
export async function feedbackFor(studentId: string): Promise<Feedback> {
  const db = await supabaseServer();
  const { data: sessions } = await db
    .from("revision_sessions")
    .select("id, reviewer_id, submitted_at, flags, overall_note")
    .eq("reciter_id", studentId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });
  if (!sessions?.length) return { sessions: [], mistakes: [] };

  const ids = sessions.map((s) => s.id);
  const [{ data: mistakes }, { data: names }] = await Promise.all([
    db.from("revision_mistakes")
      .select("id, session_id, surah_number, ayah_number, word_position, category, detail, note, created_at")
      .in("session_id", ids),
    supabaseAdmin().from("profiles").select("id, full_name")
      .in("id", [...new Set(sessions.map((s) => s.reviewer_id))]),
  ]);
  const nameOf = new Map((names ?? []).map((p) => [p.id, p.full_name]));
  return {
    sessions: sessions.map((s) => ({
      id: s.id, submitted_at: s.submitted_at, flags: s.flags ?? [],
      overall_note: s.overall_note, reviewerName: nameOf.get(s.reviewer_id) ?? "Classmate",
    })),
    mistakes: (mistakes ?? []) as MistakeRow[],
  };
}
