import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { MISTAKE_COLS, type MistakeRow } from "./mistakes";
import { CATEGORY_IDS } from "./mistake-taxonomy";
import type { Board, Source } from "./mistake-board";

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
    .select("id, kind, submitted_at")
    .eq("reciter_id", studentId)
    .in("kind", ["hearing", "peer"])
    .not("submitted_at", "is", null);
  const sessions = (rows ?? []).map((s) => ({
    id: s.id as string,
    source: (s.kind === "hearing" ? "teacher" : "partner") as Source,
    at: s.submitted_at as string,
  }));
  if (!sessions.length) return { sessions: [], marks: [] };

  const sourceOf = new Map(sessions.map((s) => [s.id, s.source]));
  const { data: mistakes } = await db
    .from("revision_mistakes")
    .select(MISTAKE_COLS)
    .in("session_id", sessions.map((s) => s.id));
  const marks = ((mistakes ?? []) as MistakeRow[])
    .filter((m) => CATEGORY_IDS.includes(m.category))
    .map((m) => ({ ...m, source: sourceOf.get(m.session_id)! }));
  return { sessions, marks };
}
