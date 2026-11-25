"use server";

/**
 * Corrections to the question bank: edit a question, approve it as it
 * stands, or bin it (and restore it). Every teacher can (0156, 0157): the
 * Exam Builder has no admins.
 *
 * An update RLS refuses comes back with no error and no rows, so every write
 * asks for the changed ids back and treats none as a failure.
 *
 * Papers already built hold their own copies of a question, so nothing here
 * reaches them.
 *
 * Only async functions may be exported from a "use server" file: the pure
 * checks live in ./bank-validate.
 */
import { revalidatePath } from "next/cache";
import type { Database } from "@/lib/database.types";
import { supabaseServer } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/teacher/guards";
import { AYAH_PROPOSALS } from "./ayah-proposals";
import { slotChoice, type SlotKey, type SlotUpdate } from "./ayah-review";
import { cleanBankPatch, mcqProblem, type BankPatch } from "./bank-validate";
import { parseKind, parseOptions } from "./parse";
import type { Result } from "./types";
import { isUuid } from "./validate";

type Db = Awaited<ReturnType<typeof supabaseServer>>;
type BankUpdate = Database["public"]["Tables"]["exam_bank_questions"]["Update"];
type Fail = { ok: false; error: string };

const PATH = "/teacher/exam-builder";
const NOT_ADMIN = "Only a teacher can change the bank.";
const NO_QUESTION = "That question isn't in the bank.";
const NOTHING_CHANGED = "Nothing changed. Check you are still signed in as a teacher.";

const fail = (error: string): Fail => ({ ok: false, error });

function dbFail(error: { message: string; code?: string }): Fail {
  if (error.code === "42501" || /row-level security/i.test(error.message)) return fail(NOT_ADMIN);
  return fail(error.message);
}

/** A signed-in teacher, or a refusal. The Exam Builder has no admins: every teacher has the same access. */
async function teacher(): Promise<{ ok: true } | Fail> {
  try {
    await requireTeacher();
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Teachers only.");
  }
  return { ok: true };
}

/** Write the change and confirm a row actually moved. */
async function write(db: Db, id: string, update: BankUpdate): Promise<Result> {
  const { data, error } = await db.from("exam_bank_questions").update(update).eq("id", id).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail(NOTHING_CHANGED);
  revalidatePath(PATH, "layout");
  return { ok: true };
}

/** Keep the question exactly as it is, and mark it looked at. */
export async function approveBankQuestion(id: string): Promise<Result> {
  if (!isUuid(id)) return fail(NO_QUESTION);
  const ok = await teacher();
  if (!ok.ok) return ok;
  const db = await supabaseServer();
  return write(db, id, { review_status: "approved" });
}

/**
 * Correct a bank question. The caller decides the review status it ends on
 * (the review page sends "approved" unless "keep flagged" is ticked); when
 * the patch leaves it out, the status is not touched.
 */
export async function updateBankQuestion(id: string, patch: BankPatch): Promise<Result> {
  if (!isUuid(id)) return fail(NO_QUESTION);
  const clean = cleanBankPatch(patch);
  if (!clean.ok) return clean;
  const ok = await teacher();
  if (!ok.ok) return ok;
  const db = await supabaseServer();
  const update = { ...clean.patch };

  if (update.topic_id !== undefined) {
    const { data, error } = await db.from("exam_bank_topics").select("id").eq("id", update.topic_id).maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("That topic isn't in the bank.");
  }

  if (update.kind !== undefined || update.options !== undefined) {
    const { data, error } = await db
      .from("exam_bank_questions").select("id, kind, options").eq("id", id).maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail(NO_QUESTION);
    const kind = update.kind ?? parseKind(data.kind);
    const options = update.options !== undefined ? update.options : parseOptions(data.options);
    const problem = mcqProblem(kind, options);
    if (problem) return fail(problem);
    // A short answer carries no options; drop any left from multiple choice.
    if (kind === "short") update.options = null;
  }

  return write(db, id, update);
}

/** Bin a question (teachers stop seeing it) or restore it from the bin. */
export async function archiveBankQuestion(id: string, archived: boolean): Promise<Result> {
  if (!isUuid(id)) return fail(NO_QUESTION);
  if (typeof archived !== "boolean") return fail("Bin it or restore it?");
  const ok = await teacher();
  if (!ok.ok) return ok;
  const db = await supabaseServer();
  return write(db, id, { archived });
}

/**
 * The owner's comparison page: one slot of a bank question back to its
 * picture (`use: false`, clears the ref) or to the typeset words (`use:
 * true`, restores the ref proposed in ayah-proposals.json). Reads the row as
 * it is now, so only that slot moves. Papers keep their own copies.
 */
export async function setAyahSlot(id: string, key: SlotKey, use: boolean): Promise<Result<{ update: SlotUpdate }>> {
  if (!isUuid(id)) return fail(NO_QUESTION);
  if (typeof use !== "boolean" || typeof key !== "string" || !(key === "prompt" || key === "term" || key.startsWith("option:"))) {
    return fail("That isn't a part of the question.");
  }
  const ok = await teacher();
  if (!ok.ok) return ok;
  const db = await supabaseServer();
  const { data: row, error } = await db
    .from("exam_bank_questions").select("id, prompt_images, prompt_quran, options").eq("id", id).maybeSingle();
  if (error) return dbFail(error);
  if (!row) return fail(NO_QUESTION);
  const choice = slotChoice(row, key, use, AYAH_PROPOSALS, id);
  if (!choice.ok) return choice;
  const written = await write(db, id, choice.update as BankUpdate);
  if (!written.ok) return written;
  revalidatePath(`${PATH}/review/ayahs`);
  return { ok: true, update: choice.update };
}
