"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { CLOSES_LABEL, PAYMENT_LINK, signupsOpen } from "./form";
import { MAX, clean, validateApplication, type ApplicationInput } from "./validate";

export type Status = Database["public"]["Enums"]["application_status_t"];
export type Result = { ok: true } | { ok: false; error: string };

const TEACHER_PATH = "/teacher/applications";

/**
 * Take an application from the public form.
 *
 * SERVICE ROLE, ON PURPOSE. `applications` has no RLS policy for `anon` at
 * all (migration 0025), so the public holds no grant on the table and cannot
 * reach it through PostgREST — it cannot read who else applied, and cannot
 * insert a row that arrives already marked 'placed'. This function is the
 * only door.
 *
 * Every answer is re-validated in `validateApplication` rather than trusted
 * from the form, and that function builds the row: it can only ever produce
 * the applicant's own answers, so no caller — however hand-rolled — can set
 * `status`, `class_id`, `notes` or `fee_settled`. See validate.ts.
 */
export async function submitApplication(input: ApplicationInput): Promise<Result> {
  // The deadline is enforced HERE, not on the page. /apply can be sitting
  // open in a tab from before it passed, or held in a CDN cache, and the
  // clock it would consult is the applicant's own to set — so the only check
  // that means anything is this one, on the server, at the moment of writing.
  if (!signupsOpen()) {
    return {
      ok: false,
      error: `Applications closed on ${CLOSES_LABEL}. Please refresh the page.`,
    };
  }

  // The tick is only asked for when there is a link to have paid through.
  const checked = validateApplication(input, Boolean(PAYMENT_LINK));
  if (!checked.ok) return { ok: false, error: checked.error };

  // The honeypot tripped. Answer exactly as on success and write nothing.
  if (checked.row === null) return { ok: true };

  const db = supabaseAdmin();
  const { error } = await db.from("applications").insert(checked.row);

  if (error) {
    // 23505 is the unique index on lower(email). Said plainly rather than
    // overwritten: a second submission may arrive after the first has been
    // heard at a recitation session and annotated, and silently replacing it
    // would erase that.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "We've already got an application from this email address. "
          + "If you need to change something, reply to us on WhatsApp.",
      };
    }
    return { ok: false, error: "Something went wrong sending that. Please try again." };
  }

  revalidatePath(TEACHER_PATH);
  return { ok: true };
}

/* ── The teacher's side ───────────────────────────────────────────────── */

/**
 * Same arrangement as the deposits screen: any teacher may change any of
 * this. The check here only keeps students and the public out — the table's
 * RLS policy is the one that actually holds, and this runs before it so the
 * failure is a sentence rather than an empty update.
 */
async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

/**
 * Move an application along: invited to the recitation session, heard,
 * placed, or declined.
 *
 * `reviewed_by` and `reviewed_at` are stamped on every move so that a list
 * worked through by several teachers at once says who did what — the same
 * question the deposits audit log exists to answer.
 */
export async function setApplicationStatus(id: string, status: Status): Promise<Result> {
  const me = await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db
    .from("applications")
    .update({ status, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(TEACHER_PATH);
  return { ok: true };
}

/** What was heard at the recitation session, in whatever words are useful. */
export async function setAssessedLevel(id: string, level: string): Promise<Result> {
  await requireTeacher();
  const v = clean(level);
  if (v.length > MAX.short) return { ok: false, error: "That's too long for the level." };
  const db = await supabaseServer();
  const { error } = await db
    .from("applications")
    .update({ assessed_level: v || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(TEACHER_PATH);
  return { ok: true };
}

export async function setApplicationNotes(id: string, notes: string): Promise<Result> {
  await requireTeacher();
  const v = clean(notes);
  if (v.length > MAX.long) return { ok: false, error: "That note is too long." };
  const db = await supabaseServer();
  const { error } = await db.from("applications").update({ notes: v || null }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(TEACHER_PATH);
  return { ok: true };
}

/**
 * The money actually arriving, which is a different fact from the applicant
 * ticking that they sent it. Nothing verifies the tick — no payment provider
 * is involved — so this is the column to trust when reconciling.
 */
export async function setFeeSettled(id: string, settled: boolean): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db
    .from("applications").update({ fee_settled: settled }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(TEACHER_PATH);
  return { ok: true };
}

/**
 * Put an applicant into a class.
 *
 * This records the decision only; it creates no account. The invitation flow
 * is unchanged and still the thing that makes a login, which is what keeps a
 * public form from ever being a route into the app.
 */
export async function placeInClass(id: string, classId: string | null): Promise<Result> {
  const me = await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db
    .from("applications")
    .update({
      class_id: classId,
      // Choosing a class IS the placement, so the status follows rather than
      // being a second thing to remember. Clearing the class steps back to
      // 'assessed' — they have still been heard.
      status: classId ? "placed" : "assessed",
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(TEACHER_PATH);
  return { ok: true };
}
