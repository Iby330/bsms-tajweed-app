"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { sessionLabel, type SessionType } from "./session";
import { isSessionDate, sessionTypeFor } from "./calendar";

async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

/**
 * The picker only offers taught dates, but a server action is a public
 * endpoint — nothing stops a crafted call writing a register for a Tuesday in
 * August. A row like that is invisible afterwards, since no date the UI can
 * reach would ever show it again.
 */
function badSession(sessionDate: string, sessionType: SessionType): string | null {
  if (!isSessionDate(sessionDate)) return `${sessionDate} is not a lesson day.`;
  if (sessionTypeFor(sessionDate) !== sessionType) {
    return `${sessionDate} is not a ${sessionLabel(sessionType)} session.`;
  }
  return null;
}

/**
 * Mark one student present or absent for one session.
 *
 * An absence can carry a strike. If it does, the strike is linked to the row so
 * that flipping the student back to present takes the strike away with it —
 * a mis-tap shouldn't leave a permanent mark against someone.
 */
export async function setPresence({
  classId,
  studentId,
  sessionDate,
  sessionType,
  present,
  absenceReason,
  strike,
  termId,
}: {
  classId: string;
  studentId: string;
  sessionDate: string;
  sessionType: SessionType;
  present: boolean;
  absenceReason?: string;
  strike?: boolean;
  termId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const teacher = await requireTeacher();
  const invalid = badSession(sessionDate, sessionType);
  if (invalid) return { ok: false, error: invalid };
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("attendance")
    .select("id, strike_id")
    .eq("student_id", studentId)
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .maybeSingle();

  // Any strike attached to the previous state of this row is no longer valid:
  // either they're present now, or the reason is being re-entered.
  let strikeId: string | null = existing?.strike_id ?? null;
  const wantStrike = !present && strike === true;
  if (strikeId && (present || !wantStrike)) {
    await db.from("attendance").update({ strike_id: null }).eq("id", existing!.id);
    await db.from("strikes").delete().eq("id", strikeId);
    strikeId = null;
  }

  if (wantStrike && !strikeId) {
    const { data: s, error: strikeErr } = await db
      .from("strikes")
      .insert({
        student_id: studentId,
        term_id: termId,
        reason: "absence",
        note: absenceReason?.trim() || `Absent — ${sessionLabel(sessionType)} session, ${sessionDate}`,
        issued_by: teacher.id,
      })
      .select("id")
      .single();
    if (strikeErr) return { ok: false, error: strikeErr.message };
    strikeId = s.id;
  }

  const { error } = await db.from("attendance").upsert(
    {
      class_id: classId,
      student_id: studentId,
      session_date: sessionDate,
      session_type: sessionType,
      present,
      absence_reason: present ? null : absenceReason?.trim() || null,
      strike_id: strikeId,
      recorded_by: teacher.id,
    },
    { onConflict: "student_id,session_date,session_type" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/teacher/attendance");
  revalidatePath("/teacher/roster");
  return { ok: true };
}

/**
 * The usual case: everyone turned up. One click fills the register, then the
 * teacher flips the two or three who didn't.
 */
export async function markAllPresent({
  classId,
  studentIds,
  sessionDate,
  sessionType,
}: {
  classId: string;
  studentIds: string[];
  sessionDate: string;
  sessionType: SessionType;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const teacher = await requireTeacher();
  const invalid = badSession(sessionDate, sessionType);
  if (invalid) return { ok: false, error: invalid };
  const db = await supabaseServer();
  if (studentIds.length === 0) return { ok: true, count: 0 };

  // Don't silently wipe strikes already issued for this session — only fill in
  // the students who haven't been marked either way yet.
  const { data: already } = await db
    .from("attendance")
    .select("student_id")
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .in("student_id", studentIds);
  const done = new Set((already ?? []).map((r) => r.student_id));
  const todo = studentIds.filter((id) => !done.has(id));
  if (todo.length === 0) return { ok: true, count: 0 };

  const { error } = await db.from("attendance").insert(
    todo.map((studentId) => ({
      class_id: classId,
      student_id: studentId,
      session_date: sessionDate,
      session_type: sessionType,
      present: true,
      recorded_by: teacher.id,
    })),
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/teacher/attendance");
  return { ok: true, count: todo.length };
}
