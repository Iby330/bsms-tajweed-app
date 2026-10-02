import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { MISTAKE_COLS, type MistakeRow } from "./mistakes";
import { CATEGORY_IDS } from "./mistake-taxonomy";
import { boardSessions, type Board, type SessionRow } from "./mistake-board";

/**
 * Every submitted session about a student — teacher hearings and partner
 * revision — and every mark in them, each tagged with where it came from.
 * Reads run as the CALLER, so RLS decides what a student or teacher may see.
 * Retired categories are left out: the board's sections are the live three.
 */
export async function boardFor(studentId: string): Promise<Board> {
  const db = await supabaseServer();
  const { data: rows } = await db
    .from("revision_sessions")
    .select("id, kind, submitted_at, reviewer_id, counts_as_result")
    .eq("reciter_id", studentId)
    .in("kind", ["hearing", "peer"])
    .not("submitted_at", "is", null);
  const all = (rows ?? []) as SessionRow[];
  if (!all.length) return { sessions: [], marks: [] };

  const { data: mistakes } = await db
    .from("revision_mistakes")
    .select(MISTAKE_COLS)
    .in("session_id", all.map((s) => s.id));
  const rowsOfMarks = (mistakes ?? []) as MistakeRow[];
  const sessions = boardSessions(all, new Set(rowsOfMarks.map((m) => m.session_id)));
  const sourceOf = new Map(sessions.map((s) => [s.id, s.source]));
  const marks = rowsOfMarks
    .filter((m) => CATEGORY_IDS.includes(m.category) && sourceOf.has(m.session_id))
    .map((m) => ({ ...m, source: sourceOf.get(m.session_id)! }));
  return { sessions, marks };
}
