import "server-only";

/**
 * Murāja'ah reads, for server components. Reads run as the CALLER, so RLS
 * (0144) decides what comes back: a listener sees their own sessions, a
 * reciter their saved ones, the class's teacher every one in the class.
 * Names go through the admin client, because students can't read each
 * other's profiles; the session row the caller could read is the
 * authorisation for showing them.
 *
 * Every list is newest first and holds SAVED sessions only (drafts come from
 * `myDraft`).
 */
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  CHECKPOINT_COLS, MARK_COLS, SESSION_COLS, toSessionView,
  type CheckpointRowLike, type MarkRowLike, type SessionRowLike, type SessionView,
} from "./sessions";
import { classTargetFromRow, overrideFromRow, type ClassTarget, type OverrideInput, type TargetOverride } from "./targets";

/** Who's in the class, for "Listening to [Name ▾]". Reused, not rewritten. */
export { classmatesOf } from "@/lib/hifz/review-queries";

const PAGE = 1000;
const CHUNK = 100;

type Db = Awaited<ReturnType<typeof supabaseServer>>;

/** Marks and checkpoints for these sessions: ids in chunks, rows in pages of 1000. */
async function childrenOf(db: Db, ids: string[]) {
  const marks: MarkRowLike[] = [];
  const cps: CheckpointRowLike[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("murajaah_marks").select(MARK_COLS)
        .in("session_id", chunk).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      marks.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE) break;
    }
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("murajaah_checkpoints").select(CHECKPOINT_COLS)
        .in("session_id", chunk).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      cps.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE) break;
    }
  }
  return { marks, cps };
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin().from("profiles").select("id, full_name").in("id", [...new Set(ids)]);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id, p.full_name]));
}

async function viewsOf(db: Db, rows: SessionRowLike[]): Promise<SessionView[]> {
  if (!rows.length) return [];
  const [{ marks, cps }, names] = await Promise.all([
    childrenOf(db, rows.map((r) => r.id)),
    namesOf(rows.flatMap((r) => [r.listener_id, r.reciter_id])),
  ]);
  return rows.map((r) => toSessionView(r, marks, cps, names));
}

async function savedWhere(column: "reciter_id" | "listener_id" | "class_id", value: string): Promise<SessionView[]> {
  const db = await supabaseServer();
  const rows: SessionRowLike[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("murajaah_sessions").select(SESSION_COLS)
      .eq(column, value).not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as SessionRowLike[]));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return viewsOf(db, rows);
}

/** The caller's open draft, with its marks and checkpoints, or null. Ustadhs students only. */
export async function myDraft(): Promise<SessionView | null> {
  const me = await currentProfile();
  if (!me || me.section !== "ustadhs" || me.role !== "student") return null;
  const db = await supabaseServer();
  const { data, error } = await db.from("murajaah_sessions").select(SESSION_COLS)
    .eq("listener_id", me.id).is("submitted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [view] = await viewsOf(db, [data as SessionRowLike]);
  return view;
}

/** Saved sessions where this student recited ("My revision", the teacher's student panel). */
export async function sessionsAsReciter(studentId: string): Promise<SessionView[]> {
  return savedWhere("reciter_id", studentId);
}

/** Saved sessions where this student listened. */
export async function sessionsAsListener(studentId: string): Promise<SessionView[]> {
  return savedWhere("listener_id", studentId);
}

/** Every saved session in the class, for its teacher's roster (RLS: teaches_class). */
export async function classSessions(classId: string): Promise<SessionView[]> {
  return savedWhere("class_id", classId);
}

/** The class's target, or the defaults when it has none. */
export async function classTarget(classId: string): Promise<ClassTarget> {
  const db = await supabaseServer();
  const { data, error } = await db.from("murajaah_targets")
    .select("ideal_min, good_min, acceptable_min, limit_hizb, limit_juz, limit_surah10")
    .eq("class_id", classId).maybeSingle();
  if (error) throw new Error(error.message);
  return classTargetFromRow(data);
}

/** Every per-student override in the class. */
export async function overrides(classId: string): Promise<OverrideInput[]> {
  const db = await supabaseServer();
  const { data, error } = await db.from("murajaah_target_overrides")
    .select("student_id, limit_hizb, limit_juz, limit_surah10, note")
    .eq("class_id", classId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ studentId: r.student_id, ...overrideFromRow(r)! }));
}

/** One student's override, or null. */
export async function overrideFor(classId: string, studentId: string): Promise<TargetOverride | null> {
  const db = await supabaseServer();
  const { data, error } = await db.from("murajaah_target_overrides")
    .select("limit_hizb, limit_juz, limit_surah10, note")
    .eq("class_id", classId).eq("student_id", studentId).maybeSingle();
  if (error) throw new Error(error.message);
  return overrideFromRow(data);
}
