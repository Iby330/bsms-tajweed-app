import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import {
  issuedHtml, issuedSubject, issuedText, removedHtml, removedSubject, removedText, type StrikeMail,
} from "@/lib/email/strike-email";

/**
 * Tell a student about a strike, by email: when one is issued, and when one
 * they were told about is taken back.
 *
 * Called with `after()` from the two places a strike is written (the strike
 * manager's actions and the register's absence path), so the teacher never
 * waits on Resend. Never throws: the strike is already saved, and a failed
 * email must not show the teacher an error for a strike that landed. A
 * failure is logged and the student still sees the strike in the app.
 *
 * `strikes.emailed_at` (migration 0110) is stamped only once the issued email
 * has actually gone. A removal email is sent only when it is set, so taking
 * back a strike from before this existed, or one whose email failed, or a
 * demo student's, does not tell anyone about a strike they never heard of.
 *
 * Demo accounts (@bsms-demo.test) are skipped: the domain does not exist,
 * and every bounce counts against the sender's reputation.
 */

type Db = ReturnType<typeof supabaseAdmin>;

/** What a removal needs to know about the strike, read before it is deleted. */
export type RemovedStrike = {
  student_id: string;
  term_id: number;
  reason: string;
  issued_at: string | null;
  emailed_at: string | null;
};

async function recipient(db: Db, studentId: string, termId: number, teacherId: string) {
  const [{ data: user }, { data: student }, { data: teacher }, { count }] = await Promise.all([
    db.auth.admin.getUserById(studentId),
    db.from("profiles").select("full_name").eq("id", studentId).maybeSingle(),
    db.from("profiles").select("full_name, section").eq("id", teacherId).maybeSingle(),
    db.from("strikes").select("id", { count: "exact", head: true })
      .eq("student_id", studentId).eq("term_id", termId),
  ]);
  const to = user?.user?.email;
  if (!to || to.endsWith("@bsms-demo.test")) return null;
  return {
    to,
    firstName: student?.full_name?.trim().split(/\s+/)[0] || "there",
    teacher: teacher ? { fullName: teacher.full_name ?? null, section: teacher.section ?? null } : null,
    count: count ?? 0,
  };
}

export async function emailStrikeIssued(strikeId: string): Promise<void> {
  try {
    const db = supabaseAdmin();
    const { data: strike } = await db
      .from("strikes")
      .select("student_id, term_id, reason, issued_at, issued_by, emailed_at")
      .eq("id", strikeId)
      .maybeSingle();
    // Gone already (taken back within the second), or told once before.
    if (!strike || strike.emailed_at) return;

    const r = await recipient(db, strike.student_id, strike.term_id, strike.issued_by);
    if (!r) return;

    const mail: StrikeMail = {
      firstName: r.firstName, reason: strike.reason, issuedAt: strike.issued_at,
      count: r.count, teacher: r.teacher,
    };
    const result = await sendEmail({
      to: r.to, subject: issuedSubject(mail), html: issuedHtml(mail), text: issuedText(mail),
    });
    if (!result.ok) {
      console.error(`Strike email to ${strike.student_id} failed: ${result.error}`);
      return;
    }
    await db.from("strikes").update({ emailed_at: new Date().toISOString() }).eq("id", strikeId);
  } catch (e) {
    console.error(`Strike email for ${strikeId} failed:`, e);
  }
}

export async function emailStrikeRemoved(strike: RemovedStrike, removedBy: string): Promise<void> {
  try {
    if (!strike.emailed_at) return;
    const db = supabaseAdmin();
    const r = await recipient(db, strike.student_id, strike.term_id, removedBy);
    if (!r) return;

    const mail: StrikeMail = {
      firstName: r.firstName, reason: strike.reason, issuedAt: strike.issued_at,
      count: r.count, teacher: r.teacher,
    };
    const result = await sendEmail({
      to: r.to, subject: removedSubject(), html: removedHtml(mail), text: removedText(mail),
    });
    if (!result.ok) console.error(`Strike-removed email to ${strike.student_id} failed: ${result.error}`);
  } catch (e) {
    console.error(`Strike-removed email to ${strike.student_id} failed:`, e);
  }
}
