import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahPageSpans } from "@/lib/reference/cached";
import { collectDays, type RevisionDay } from "./revision-activity";

/**
 * One student's revision activity, day by day.
 *
 * Two sources, both already recorded:
 *  - hifz_records.passed_at — a dated surah sign-off, converted to a page
 *    count through quran_words (see getCachedSurahPageSpans)
 *  - revision_sessions.submitted_at — a submitted peer-revision session
 *
 * RLS decides visibility: a student sees their own rows, a teacher sees their
 * roster. When timed hizb sessions land, add their pages into collectDays and
 * the heatmap picks them up with no other change.
 */
export async function revisionActivityFor(studentId: string): Promise<RevisionDay[]> {
  const db = await supabaseServer();
  const [spans, signOffs, sessions] = await Promise.all([
    getCachedSurahPageSpans(),
    db.from("hifz_records").select("surah_number, passed_at").eq("student_id", studentId),
    db.from("revision_sessions").select("submitted_at")
      .eq("reciter_id", studentId).not("submitted_at", "is", null),
  ]);
  return collectDays(
    signOffs.data ?? [],
    (sessions.data ?? []).filter((s): s is { submitted_at: string } => Boolean(s.submitted_at)),
    spans,
  );
}
