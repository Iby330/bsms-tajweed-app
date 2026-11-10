"use server";

/**
 * Murāja'ah server actions. Only for the Esteemed Ustadhs class: every action
 * checks currentProfile() and section === 'ustadhs' (students for the
 * listener's actions, the class's own teacher for saveTargets), and every id
 * is checked against a UUID pattern before it reaches a query. RLS (0144)
 * checks the rest again: listener + draft for writes, can_listen_freely for a
 * new session, teaches_class for targets.
 *
 * The clock is the database's: start/pause/resume/finish call
 * public.murajaah_clock(), which uses now(), and Save calls
 * public.murajaah_submit().
 *
 * Revalidation: only the actions that change what a page lists (startDraft,
 * discardDraft, deleteSession, submitSession, saveTargets) revalidate. The
 * in-session ones (clock, marks, checkpoints, types) return what the client
 * needs and revalidate nothing, so a tap doesn't re-render the page.
 *
 * Only async functions may be exported from a "use server" file: the pure
 * helpers live in the sibling modules.
 */
import { revalidatePath } from "next/cache";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { autoCheckpoints, nextAddedOrd, nextAutoOrd } from "./checkpoints";
import type { ClockOp, ClockSnapshot } from "./clock";
import { hizbEqOf, isPortionKind, normaliseSelection, PORTION_COUNT, selectionLabel, surahInfo, type PortionKind } from "./portions";
import { MARK_CATEGORIES, type MarkCategory, type MarkLocation } from "./sessions";
import {
  classTargetFromRow, mistakeLimitFor, overrideFromRow, validateClassTarget, validateOverride,
  type ClassTarget, type OverrideInput,
} from "./targets";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A session clock past a day is a mistake, not a recitation. */
const MAX_AT_MS = 24 * 60 * 60 * 1000;

function checkId(id: unknown, what: string): asserts id is string {
  if (typeof id !== "string" || !UUID_RE.test(id)) throw new Error(`Unknown ${what}.`);
}

function checkAtMs(atMs: unknown): asserts atMs is number {
  if (typeof atMs !== "number" || !Number.isInteger(atMs) || atMs < 0 || atMs > MAX_AT_MS) {
    throw new Error("That time is not on the session clock.");
  }
}

/** A student of the ustadhs class, with a class. */
async function requireListener() {
  const me = await currentProfile();
  if (!me) throw new Error("Sign in first.");
  if (me.section !== "ustadhs" || me.role !== "student" || !me.class_id) {
    throw new Error("Murāja'ah is for the Esteemed Ustadhs class.");
  }
  return { ...me, class_id: me.class_id };
}

/** The ustadhs class's teacher, for this class. RLS re-checks teaches_class(). */
async function requireClassTeacher(classId: string) {
  const me = await currentProfile();
  if (!me) throw new Error("Sign in first.");
  if (me.section !== "ustadhs" || me.role !== "teacher") {
    throw new Error("Only the Esteemed Ustadhs' teacher sets these targets.");
  }
  const db = await supabaseServer();
  const { data: cls, error } = await db
    .from("classes").select("id").eq("id", classId).eq("teacher_id", me.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cls) throw new Error("Not your class.");
  return me;
}

/**
 * Open a draft: the listener (the caller) times `reciterId` reciting this
 * portion. Snapshots the class target and the reciter's override, and
 * replaces any draft the listener already has. Returns the session id.
 */
export async function startDraft(reciterId: string, kind: PortionKind, ns: number[]): Promise<string> {
  checkId(reciterId, "student");
  if (!isPortionKind(kind)) throw new Error("Pick a hizb, juz or surah.");
  let units: number[];
  try {
    units = normaliseSelection(kind, ns);
  } catch {
    throw new Error(`Pick ${kind === "surah" ? "surahs" : kind} between 1 and ${PORTION_COUNT[kind]}.`);
  }
  const me = await requireListener();
  if (reciterId === me.id) throw new Error("Pick a classmate to listen to.");
  const db = await supabaseServer();

  const [{ data: tRow, error: tErr }, { data: oRow, error: oErr }] = await Promise.all([
    db.from("murajaah_targets")
      .select("ideal_min, good_min, acceptable_min, limit_hizb, limit_juz, limit_surah10")
      .eq("class_id", me.class_id).maybeSingle(),
    db.from("murajaah_target_overrides")
      .select("limit_hizb, limit_juz, limit_surah10, note")
      .eq("student_id", reciterId).eq("class_id", me.class_id).maybeSingle(),
  ]);
  if (tErr) throw new Error(tErr.message);
  if (oErr) throw new Error(oErr.message);
  const target = classTargetFromRow(tRow);
  const override = overrideFromRow(oRow);

  // One open draft per listener (a unique index says so too).
  const { error: delErr } = await db
    .from("murajaah_sessions").delete()
    .eq("listener_id", me.id).is("submitted_at", null);
  if (delErr) throw new Error(delErr.message);

  const { data, error } = await db
    .from("murajaah_sessions")
    .insert({
      class_id: me.class_id,
      listener_id: me.id,
      reciter_id: reciterId,
      portion_kind: kind,
      portion_ns: units,
      portion_label: selectionLabel(kind, units),
      hizb_eq: hizbEqOf(kind, units),
      mistake_limit: mistakeLimitFor(kind, units, target, override),
      band_minutes: target.minutes,
    })
    .select("id").single();
  if (error) {
    // RLS: can_listen_freely failed, i.e. not a classmate.
    if (error.code === "42501") throw new Error("You can only listen to a classmate.");
    throw new Error(error.message);
  }
  revalidatePath("/hifdh");
  return data.id;
}

async function deleteDraft(id: string): Promise<void> {
  checkId(id, "session");
  const me = await requireListener();
  const db = await supabaseServer();
  const { data, error } = await db
    .from("murajaah_sessions").delete()
    .eq("id", id).eq("listener_id", me.id).is("submitted_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No draft of yours with that id.");
  revalidatePath("/hifdh");
}

/** Throw the draft away (Discard, or Start over). Its marks and checkpoints go with it. */
export async function discardDraft(id: string): Promise<void> {
  await deleteDraft(id);
}

/** Delete a session; only a draft can be deleted. Same as discardDraft. */
export async function deleteSession(id: string): Promise<void> {
  await deleteDraft(id);
}

async function clock(id: string, op: ClockOp): Promise<ClockSnapshot> {
  checkId(id, "session");
  await requireListener();
  const db = await supabaseServer();
  const { data, error } = await db.rpc("murajaah_clock", { p_session: id, p_op: op });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) throw new Error("The clock did not answer.");
  return row;
}

/** The first Start (also resumes a pause). Returns the server's clock. */
export async function startClock(id: string): Promise<ClockSnapshot> {
  return clock(id, "start");
}
export async function pauseClock(id: string): Promise<ClockSnapshot> {
  return clock(id, "pause");
}
export async function resumeClock(id: string): Promise<ClockSnapshot> {
  return clock(id, "resume");
}
/** Stops the clock for good. Types may be set after this; then submitSession. */
export async function finishClock(id: string): Promise<ClockSnapshot> {
  return clock(id, "finish");
}

/**
 * A mistake at `atMs` on the session clock. `loc` null = "Mistake +1" (no
 * place); `position: null` = the whole ayah. Returns the mark id (for Undo).
 */
export async function addMark(id: string, atMs: number, loc: MarkLocation | null): Promise<string> {
  checkId(id, "session");
  checkAtMs(atMs);
  if (loc !== null) {
    const ok =
      Number.isInteger(loc.surah) && loc.surah >= 1 && loc.surah <= 114 &&
      Number.isInteger(loc.ayah) && loc.ayah >= 1 && loc.ayah <= surahInfo(loc.surah).ayahs &&
      (loc.position === null || (Number.isInteger(loc.position) && loc.position >= 1 && loc.position <= 200));
    if (!ok) throw new Error("That word is not in the mushaf.");
  }
  await requireListener();
  const db = await supabaseServer();
  const { data, error } = await db
    .from("murajaah_marks")
    .insert({
      session_id: id,
      at_ms: atMs,
      surah_number: loc?.surah ?? null,
      ayah_number: loc?.ayah ?? null,
      word_position: loc?.position ?? null,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Remove one mark (Undo, or tapping a tinted word again). */
export async function removeMark(markId: string): Promise<void> {
  checkId(markId, "mark");
  await requireListener();
  const db = await supabaseServer();
  const { data, error } = await db.from("murajaah_marks").delete().eq("id", markId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("That mark is not in a draft of yours.");
}

/**
 * Tick a checkpoint at `atMs`. Returns its id.
 * - 'auto': `ord` must be the next one in order (1-based). The stored label
 *   is the canonical one from autoCheckpoints(), whatever `label` says.
 * - 'added': the server picks the ord (1000 + n), so pass any `ord` (0 is
 *   fine); `label` is kept, trimmed, or "Checkpoint n" when blank.
 */
export async function tickCheckpoint(
  id: string, kind: "auto" | "added", ord: number, label: string, atMs: number,
): Promise<string> {
  checkId(id, "session");
  checkAtMs(atMs);
  if (kind !== "auto" && kind !== "added") throw new Error("Unknown checkpoint kind.");
  await requireListener();
  const db = await supabaseServer();

  const [{ data: s, error: sErr }, { data: existing, error: cErr }] = await Promise.all([
    db.from("murajaah_sessions").select("portion_kind, portion_ns").eq("id", id).is("submitted_at", null).maybeSingle(),
    db.from("murajaah_checkpoints").select("ord").eq("session_id", id),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (cErr) throw new Error(cErr.message);
  if (!s || !isPortionKind(s.portion_kind)) throw new Error("No draft of yours with that id.");
  const ords = (existing ?? []).map((c) => c.ord);

  let row: { ord: number; label: string };
  if (kind === "auto") {
    const autos = autoCheckpoints(s.portion_kind, s.portion_ns);
    const next = nextAutoOrd(autos.length, ords);
    if (next === null) throw new Error("Every checkpoint is already ticked.");
    if (ord !== next) throw new Error("Tick the checkpoints in order.");
    row = { ord, label: autos[ord - 1].label };
  } else {
    const n = nextAddedOrd(ords);
    const text = (label ?? "").trim().slice(0, 200);
    row = { ord: n, label: text || `Checkpoint ${n - 1000}` };
  }

  const { data, error } = await db
    .from("murajaah_checkpoints")
    .insert({ session_id: id, kind, ord: row.ord, label: row.label, at_ms: atMs })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Untick a checkpoint. Only the latest automatic tick can be unticked; an added one can always go. */
export async function untickCheckpoint(cpId: string): Promise<void> {
  checkId(cpId, "checkpoint");
  await requireListener();
  const db = await supabaseServer();
  const { data: cp, error } = await db
    .from("murajaah_checkpoints").select("id, session_id, kind, ord").eq("id", cpId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cp) throw new Error("That checkpoint is not in a draft of yours.");
  if (cp.kind === "auto") {
    const { data: later, error: lErr } = await db
      .from("murajaah_checkpoints").select("id")
      .eq("session_id", cp.session_id).eq("kind", "auto").gt("ord", cp.ord);
    if (lErr) throw new Error(lErr.message);
    if (later?.length) throw new Error("Untick the latest checkpoint first.");
  }
  const { data: gone, error: dErr } = await db.from("murajaah_checkpoints").delete().eq("id", cpId).select("id");
  if (dErr) throw new Error(dErr.message);
  if (!gone?.length) throw new Error("That checkpoint is not in a draft of yours.");
}

/**
 * Give marks a type (or clear it with null), after Finish and before Save.
 * Makhraj is refused on a whole-ayah mark, as the DB does.
 */
export async function setMarkTypes(
  id: string, types: { markId: string; category: MarkCategory | null }[],
): Promise<void> {
  checkId(id, "session");
  if (!Array.isArray(types)) throw new Error("Nothing to save.");
  for (const t of types) {
    checkId(t.markId, "mark");
    if (t.category !== null && !MARK_CATEGORIES.includes(t.category)) throw new Error("Unknown mistake type.");
  }
  if (!types.length) return;
  await requireListener();
  const db = await supabaseServer();

  const { data: marks, error } = await db
    .from("murajaah_marks").select("id, surah_number, word_position").eq("session_id", id);
  if (error) throw new Error(error.message);
  const byId = new Map((marks ?? []).map((m) => [m.id, m]));
  for (const t of types) {
    const m = byId.get(t.markId);
    if (!m) throw new Error("That mark is not in this session.");
    if (t.category === "makhraj" && m.surah_number !== null && m.word_position === null) {
      throw new Error("Makhraj applies to a word, not a whole ayah.");
    }
  }

  const results = await Promise.all(
    types.map((t) =>
      db.from("murajaah_marks").update({ category: t.category })
        .eq("id", t.markId).eq("session_id", id).select("id"),
    ),
  );
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    if (!r.data?.length) throw new Error("This session is already saved.");
  }
}

/** Save a finished draft with its note. */
export async function submitSession(id: string, note: string | null): Promise<void> {
  checkId(id, "session");
  const text = (note ?? "").trim();
  if (text.length > 2000) throw new Error("Keep the note under 2000 characters.");
  await requireListener();
  const db = await supabaseServer();
  const { error } = await db.rpc("murajaah_submit", { p_session: id, p_note: text || null });
  if (error) throw new Error(error.message);
  revalidatePath("/hifdh");
  revalidatePath("/teacher/hifdh");
}

/**
 * The targets panel's Save: the class's minutes and limits, and the FULL
 * list of per-student overrides. A student left out of `overrides`, or given
 * all-blank limits and no note, loses their override.
 */
export async function saveTargets(classId: string, target: ClassTarget, overrides: OverrideInput[]): Promise<void> {
  checkId(classId, "class");
  const bad = validateClassTarget(target);
  if (bad) throw new Error(bad);
  if (!Array.isArray(overrides)) throw new Error("Unknown overrides.");
  for (const o of overrides) {
    checkId(o.studentId, "student");
    const why = validateOverride(o);
    if (why) throw new Error(why);
  }
  const me = await requireClassTeacher(classId);
  const db = await supabaseServer();
  const now = new Date().toISOString();

  const { error: tErr } = await db.from("murajaah_targets").upsert(
    {
      class_id: classId,
      ideal_min: target.minutes.ideal, good_min: target.minutes.good, acceptable_min: target.minutes.acceptable,
      limit_hizb: target.limits.hizb, limit_juz: target.limits.juz, limit_surah10: target.limits.surah10,
      updated_by: me.id, updated_at: now,
    },
    { onConflict: "class_id" },
  );
  if (tErr) throw new Error(tErr.message);

  const keep = overrides.filter(
    (o) => o.hizb !== null || o.juz !== null || o.surah10 !== null || !!o.note?.trim(),
  );
  // The ids are UUID-checked above, so they are safe inside the filter string.
  let drop = db.from("murajaah_target_overrides").delete().eq("class_id", classId);
  if (keep.length) drop = drop.not("student_id", "in", `(${keep.map((o) => o.studentId).join(",")})`);
  const { error: dErr } = await drop;
  if (dErr) throw new Error(dErr.message);

  if (keep.length) {
    const { error: oErr } = await db.from("murajaah_target_overrides").upsert(
      keep.map((o) => ({
        student_id: o.studentId, class_id: classId,
        limit_hizb: o.hizb, limit_juz: o.juz, limit_surah10: o.surah10,
        note: o.note?.trim() || null, updated_by: me.id, updated_at: now,
      })),
      { onConflict: "student_id" },
    );
    if (oErr) throw new Error(oErr.message);
  }
  revalidatePath("/teacher/hifdh");
  revalidatePath("/hifdh");
}
