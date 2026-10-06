import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { markedHtml, markedSubject, markedText, type MarkedAnswer } from "@/lib/email/marked-email";

/**
 * Tell a student their homework is marked, by email.
 *
 * Called by `approveSubmission` once the marks are released, with the marks it
 * has just written. Never throws: the release is already done, and a failed
 * email must not show the teacher an error for marking that succeeded. A
 * failure is logged and the student still sees the mark in the app.
 *
 * Demo accounts (@bsms-demo.test) are skipped: the domain does not exist,
 * and every bounce counts against the sender's reputation.
 */
export async function emailMarkedHomework(o: {
  studentId: string;
  homeworkId: string;
  teacher: { fullName: string | null; section: string | null };
  pct: number | null;
  redo: boolean;
  answers: MarkedAnswer[];
}): Promise<void> {
  try {
    const db = supabaseAdmin();
    const [{ data: user }, { data: profile }, { data: homework }] = await Promise.all([
      db.auth.admin.getUserById(o.studentId),
      db.from("profiles").select("full_name").eq("id", o.studentId).maybeSingle(),
      db
        .from("homeworks")
        .select("number, title, is_graded, questions(id, qtype, prompt, points, is_bonus, is_task, options, position)")
        .eq("id", o.homeworkId)
        .maybeSingle(),
    ]);

    const to = user?.user?.email;
    if (!to || to.endsWith("@bsms-demo.test") || !homework) return;

    const mail = {
      firstName: profile?.full_name?.trim().split(/\s+/)[0] || "there",
      homeworkNumber: homework.number,
      homeworkTitle: homework.title,
      teacher: o.teacher,
      graded: homework.is_graded,
      pct: o.pct,
      redo: o.redo,
      questions: [...(homework.questions ?? [])].sort((a, b) => a.position - b.position),
      answers: o.answers,
    };
    const result = await sendEmail({
      to,
      subject: markedSubject(mail),
      html: markedHtml(mail),
      text: markedText(mail),
    });
    if (!result.ok) console.error(`Marked-homework email to ${o.studentId} failed: ${result.error}`);
  } catch (e) {
    console.error(`Marked-homework email to ${o.studentId} failed:`, e);
  }
}
