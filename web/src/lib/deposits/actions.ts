"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

export type Result = { ok: true } | { ok: false; error: string };

const PATH = "/teacher/deposits";

/**
 * Every teacher may change every part of this, which is the arrangement the
 * programme actually runs on. The audit trigger on each table is what makes
 * that safe rather than the permission check — this only keeps students out.
 */
async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

export async function setStillIn(entryId: string, stillIn: boolean): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db
    .from("deposit_entries").update({ still_in: stillIn }).eq("id", entryId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Hand-editing a strike counter.
 *
 * These stay writable even though issuing a strike updates them on its own:
 * most of the roster predates the app or never had an account, and their
 * counts can only ever be typed in. Where a student IS linked, a later strike
 * will move this number again — the trigger is the one that keeps up, not the
 * other way round.
 */
export async function setStrikeCount(
  entryId: string,
  term: 1 | 2 | 3,
  count: number,
): Promise<Result> {
  await requireTeacher();
  if (!Number.isFinite(count) || count < 0) {
    return { ok: false, error: "A strike count can't be negative." };
  }
  const db = await supabaseServer();
  // Spelled out rather than a computed key: `{ [column]: n }` widens to
  // `{ [x: string]: number }`, which the generated Update type rejects.
  const n = Math.round(count);
  const patch =
    term === 1 ? { term1_strikes: n } : term === 2 ? { term2_strikes: n } : { term3_strikes: n };
  const { error } = await db.from("deposit_entries").update(patch).eq("id", entryId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setEntryNotes(entryId: string, notes: string): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db
    .from("deposit_entries").update({ notes: notes.trim() || null }).eq("id", entryId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/** A person with no app account — the waiting list, a no-show, a drop-out. */
export async function addEntry(
  seasonId: number,
  fullName: string,
  section: "brothers" | "sisters",
): Promise<Result> {
  await requireTeacher();
  if (!fullName.trim()) return { ok: false, error: "A name is needed." };
  const db = await supabaseServer();
  const { error } = await db.from("deposit_entries").insert({
    season_id: seasonId,
    full_name: fullName.trim(),
    section,
    still_in: true,
    term1_strikes: 0,
    term2_strikes: 0,
    term3_strikes: 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Take a row off the roster entirely.
 *
 * Distinct from the Y/N toggle, which is what "left the course" means — that
 * keeps them listed, because the sheet's value is that it never forgets
 * anyone. This is for a row that shouldn't exist at all: a duplicate, or a
 * name typed in twice. Payments go with it, and the audit log keeps the
 * before-image either way.
 */
export async function deleteEntry(entryId: string): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db.from("deposit_entries").delete().eq("id", entryId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Record a payment. The first is the deposit; anything after is a buy-back
 * following three strikes, which is why the amount is passed rather than
 * assumed — the price is a property of the season and may change between one
 * payment and the next.
 */
export async function addPayment(
  entryId: string,
  amount: number,
  kind: "deposit" | "re_entry",
): Promise<Result> {
  const teacher = await requireTeacher();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "A payment has to be more than nothing." };
  }
  const db = await supabaseServer();
  const { error } = await db.from("deposit_payments").insert({
    entry_id: entryId,
    amount,
    kind,
    recorded_by: teacher.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function removeLastPayment(entryId: string): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { data: last } = await db
    .from("deposit_payments").select("id")
    .eq("entry_id", entryId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!last) return { ok: false, error: "There's no payment to undo." };
  const { error } = await db.from("deposit_payments").delete().eq("id", last.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Whoever fronted the money is either a teacher — in which case store the id,
 * so the name follows them if it is ever corrected — or someone with no
 * account, in which case the free-text name is all there is. Exactly one of
 * the two is set; storing both would leave two answers to the same question.
 */
export async function addExpense(
  seasonId: number,
  description: string,
  category: string,
  amount: number,
  paidById: string | null,
  paidByName: string,
): Promise<Result> {
  await requireTeacher();
  if (!description.trim()) return { ok: false, error: "A cost needs a description." };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "That amount isn't a number." };
  if (!paidById && !paidByName.trim()) {
    return { ok: false, error: "Say who paid for it." };
  }
  const db = await supabaseServer();
  const { error } = await db.from("expenses").insert({
    season_id: seasonId,
    description: description.trim(),
    category,
    amount,
    paid_by: paidById,
    paid_by_name: paidById ? null : paidByName.trim(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setExpenseReimbursed(id: string, reimbursed: boolean): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db.from("expenses").update({ reimbursed }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<Result> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db.from("expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}

/** The carry-over from last year, and what a deposit costs this year. */
export async function setSeasonFigures(
  seasonId: number,
  openingBalance: number,
  depositAmount: number,
): Promise<Result> {
  await requireTeacher();
  if (!Number.isFinite(openingBalance) || !Number.isFinite(depositAmount)) {
    return { ok: false, error: "Both figures have to be numbers." };
  }
  const db = await supabaseServer();
  const { error } = await db
    .from("seasons")
    .update({ opening_balance: openingBalance, deposit_amount: depositAmount })
    .eq("id", seasonId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PATH);
  return { ok: true };
}
