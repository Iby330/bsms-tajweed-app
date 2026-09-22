"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { randomBytes } from "node:crypto";
import { CLOSES_LABEL, PAYMENT_LINK, WHATSAPP_GROUPS, feeLabel, signupsOpen } from "./form";
import { MAX, clean, validateApplication, type ApplicationInput } from "./validate";
import { sendEmail } from "@/lib/email/send";
import {
  SITE, confirmationHtml, confirmationSubject, confirmationText, loginHtml, loginSubject,
  loginText, type Confirmation,
} from "@/lib/email/applicant-emails";

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
  const { data: saved, error } = await db
    .from("applications").insert(checked.row).select("id").single();

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

  // The confirmation email. Awaited, because a serverless function can be
  // frozen the moment it returns and a fire-and-forget send would sometimes
  // never leave. But its failure is NOT the applicant's: the application is
  // saved, and telling them otherwise would have them submit again and hit
  // the duplicate-email error. A null confirmation_sent_at is what flags it
  // on the teacher's board instead.
  const r = checked.row;
  const side = r.section as "brothers" | "sisters";
  const c: Confirmation = {
    firstName: r.first_name,
    section: side,
    feeLabel: feeLabel(),
    paidConfirmed: Boolean(r.paid_confirmed),
    whatsappLink: WHATSAPP_GROUPS[side],
    paymentLink: PAYMENT_LINK,
  };
  const sent = await sendEmail({
    to: r.email,
    subject: confirmationSubject(),
    html: confirmationHtml(c),
    text: confirmationText(c),
  });
  if (sent.ok) {
    await db.from("applications")
      .update({ confirmation_sent_at: new Date().toISOString() }).eq("id", saved.id);
  } else {
    console.error(`confirmation email to application ${saved.id} failed: ${sent.error}`);
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
 * Move applications along: invited to the recitation session, heard,
 * placed, or declined. One or many; the board's single dropdown and its
 * "Decline selected" both come through here.
 *
 * `reviewed_by` and `reviewed_at` are stamped on every move so that a list
 * worked through by several teachers at once says who did what: the same
 * question the deposits audit log exists to answer.
 */
export async function setApplicationStatus(
  ids: string | string[], status: Status,
): Promise<Result> {
  const me = await requireTeacher();
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { ok: true };
  const db = await supabaseServer();
  const { error } = await db
    .from("applications")
    .update({ status, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
    .in("id", list);
  if (error) return { ok: false, error: error.message };
  await syncAccounts(list);
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
 * Put one or more applicants into a class, or take them out of one.
 *
 * Only applicants on the class's own side are moved. The board only offers
 * same-side classes, but a selection can span both sides, and this is where
 * that is actually held: a brother cannot land in a sisters' class however
 * the request is shaped. The ones left out are counted back so the screen can
 * say so rather than appearing to have done it.
 *
 * Placing makes no account by itself; Send login does that. For someone who
 * already has one, the move follows through to their profile (see
 * syncAccounts), so a late change of class is one dropdown, not two.
 */
export async function placeInClass(
  ids: string | string[], classId: string | null,
): Promise<Result & { skipped?: number }> {
  const me = await requireTeacher();
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { ok: true };
  const db = await supabaseServer();

  let query = db
    .from("applications")
    .update({
      class_id: classId,
      // Choosing a class IS the placement, so the status follows rather than
      // being a second thing to remember. Clearing the class steps back to
      // 'assessed': they have still been heard.
      status: classId ? "placed" : "assessed",
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
    })
    .in("id", list);

  if (classId) {
    const { data: cls } = await db
      .from("classes").select("section").eq("id", classId).maybeSingle();
    if (!cls || (cls.section !== "brothers" && cls.section !== "sisters")) {
      return { ok: false, error: "That class can't take applicants." };
    }
    query = query.eq("section", cls.section);
  }

  const { data, error } = await query.select("id");
  if (error) return { ok: false, error: error.message };
  await syncAccounts(list);
  revalidatePath(TEACHER_PATH);
  return { ok: true, skipped: list.length - (data?.length ?? 0) };
}

/**
 * Carry a decision through to the account, for applicants who already have
 * one (their login has been sent).
 *
 * The profile follows the application: its class is the application's class,
 * and it is active only while the application is placed. Declining someone
 * after their login went out therefore takes them off every register and
 * teacher screen (all of which filter on is_active) without deleting
 * anything, and placing them again brings them back. Applicants with no
 * account yet are untouched: there is nothing to follow.
 */
async function syncAccounts(ids: string[]) {
  const db = await supabaseServer();
  const { data } = await db
    .from("applications")
    .select("profile_id, class_id, status")
    .in("id", ids)
    .not("profile_id", "is", null);

  for (const a of data ?? []) {
    const placed = a.status === "placed" && a.class_id !== null;
    await db.from("profiles")
      .update(placed ? { class_id: a.class_id, is_active: true } : { is_active: false })
      .eq("id", a.profile_id!);
  }
}

/* ── Sending the login ────────────────────────────────────────────────── */

/**
 * Make a placed applicant's account and email them the link to it.
 *
 * ONE applicant per call, on purpose. The board sends a selection by calling
 * this once per person in turn, which keeps each call to a second or two
 * (well inside a Netlify function's time limit however many are selected),
 * stays under Resend's rate limit without any throttling code, and lets the
 * screen tick people off as they go and say exactly who failed and why.
 *
 * Safe to call again for the same person: it resends, reusing the account
 * made the first time. That is also the fix when a link expires unopened.
 *
 * The email carries a set-your-password link, never a password. The account
 * is created with a random one that nobody sees, and the link (the same
 * recovery-token route the teacher invitations use) lands them on /welcome
 * to choose their own.
 */
export async function sendLogin(id: string): Promise<Result> {
  await requireTeacher();
  const admin = supabaseAdmin();

  const { data: app } = await admin
    .from("applications")
    .select("id, first_name, surname, email, section, status, class_id, profile_id")
    .eq("id", id)
    .maybeSingle();
  if (!app) return { ok: false, error: "Application not found." };
  if (app.status !== "placed" || !app.class_id) {
    return { ok: false, error: "Place them in a class first." };
  }

  const { data: cls } = await admin
    .from("classes").select("name").eq("id", app.class_id).maybeSingle();
  if (!cls) return { ok: false, error: "Their class no longer exists." };

  const fullName = `${app.first_name} ${app.surname}`;
  const side = app.section as "brothers" | "sisters";
  let userId = app.profile_id;

  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: app.email,
      // Never seen by anyone: the email's link is how they choose their own.
      password: randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (created?.user) {
      userId = created.user.id;
      // setup_complete false sends them to /welcome on every page until they
      // have chosen a password (lib/account/require-setup.ts).
      const { error: pErr } = await admin.from("profiles").upsert({
        id: userId, full_name: fullName, role: "student", section: side,
        class_id: app.class_id, is_active: true, setup_complete: false,
      });
      if (pErr) return { ok: false, error: `Account made, profile not: ${pErr.message}` };
    } else {
      // The address already has an account. A returning student is fine to
      // reuse; a teacher's is not, since this would turn them into a student.
      const existing = await findUserByEmail(app.email);
      if (!existing) return { ok: false, error: error?.message ?? "Could not create the account." };
      const { data: prof } = await admin
        .from("profiles").select("role").eq("id", existing).maybeSingle();
      if (prof?.role === "teacher") {
        return { ok: false, error: "That email already belongs to a teacher account." };
      }
      userId = existing;
      const { error: pErr } = await admin.from("profiles").upsert({
        id: userId, full_name: fullName, role: "student", section: side,
        class_id: app.class_id, is_active: true,
      });
      if (pErr) return { ok: false, error: pErr.message };
    }

    // Recorded before the email, so a failed send followed by a retry reuses
    // this account rather than tripping over it.
    await admin.from("applications").update({ profile_id: userId }).eq("id", id);
  }

  // generateLink mints the token WITHOUT sending Supabase's own email; the
  // message is ours.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: app.email,
  });
  if (linkErr || !linkData) {
    return { ok: false, error: `Could not make the link: ${linkErr?.message}` };
  }
  const link = `${SITE}/auth/confirm?token_hash=${linkData.properties.hashed_token}`
    + `&type=recovery&next=${encodeURIComponent("/welcome")}`;

  const login = {
    firstName: app.first_name, email: app.email, section: side, className: cls.name, link,
  };
  const sent = await sendEmail({
    to: app.email,
    subject: loginSubject(),
    html: loginHtml(login),
    text: loginText(login),
  });
  if (!sent.ok) return { ok: false, error: `Email not sent: ${sent.error}` };

  await admin.from("applications")
    .update({ login_sent_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(TEACHER_PATH);
  return { ok: true };
}

/** The auth user for an address. listUsers has no email filter; an intake is
 *  tens of accounts on top of a hundred or so, well inside one page. */
async function findUserByEmail(email: string): Promise<string | null> {
  const { data } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const want = email.toLowerCase();
  return data?.users.find((u) => u.email?.toLowerCase() === want)?.id ?? null;
}
