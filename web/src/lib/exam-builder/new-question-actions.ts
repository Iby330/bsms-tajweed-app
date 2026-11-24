"use server";

/**
 * A question a teacher writes themselves. The owner's rule: a new question
 * goes into the bank, with a note of who wrote it and when ("Ibrahim
 * Ramadan, Nov 2026"), so the bank grows as papers are built. Written from a
 * paper, it is then copied onto that paper like any bank question, so the
 * paper's copy keeps `bank_question_id`. A teacher can tick "keep this
 * question out of the bank" for a one-off: then only the paper gets it.
 *
 * Pictures are uploaded from the browser straight to the exam-questions
 * bucket under `new/<profile id>/` (the storage policy lets teachers insert
 * under `new/` only); `signNewQuestionImage` signs one of the caller's own
 * uploads so the form can show it at once.
 *
 * Like ./actions, nothing here revalidates: the workspace and the bank page
 * keep the new question in their own state.
 *
 * Only async functions may be exported from a "use server" file: the pure
 * checks live in ./new-question-validate.
 */
import { supabaseServer } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/teacher/guards";
import { addBlankItem, addItemFromBank, removeItem, updateItem } from "./actions";
import { collectImagePaths, signExamImages } from "./images";
import { cleanNewQuestion, isOwnUpload, writtenSource } from "./new-question-validate";
import { toBankQuestion } from "./parse";
import type { BankQuestion, PaperItem, Result } from "./types";
import { answerLinesFor, isUuid } from "./validate";

type Fail = { ok: false; error: string };
type Me = { id: string; full_name: string | null };
const fail = (error: string): Fail => ({ ok: false, error });

async function teacher(): Promise<({ ok: true } & Me) | Fail> {
  try {
    const me = await requireTeacher();
    return { ok: true, id: me.id, full_name: me.full_name ?? null };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Teachers only.");
  }
}

/** A paper and a question section of it, both uuids. */
export type Placement = { paperId: string; sectionId: string };

/** Pictures in a question, its options' included, are only the caller's own uploads. */
function ownPictures(paths: string[], meId: string): boolean {
  return paths.every((p) => isOwnUpload(p, meId));
}

/**
 * Put a teacher's question into the bank, and onto the paper when `place` is
 * given. Returns the bank question (pictures signed) and the paper's copy.
 * If the bank took it but the paper did not, the question is still returned
 * and `addError` says why it is not on the paper.
 */
export async function addBankQuestion(
  input: unknown,
  place?: Placement,
): Promise<Result<{ question: BankQuestion; item: PaperItem | null; addError?: string }>> {
  const me = await teacher();
  if (!me.ok) return me;
  const clean = cleanNewQuestion(input);
  if (!clean.ok) return clean;
  const q = clean.value;
  if (!ownPictures(collectImagePaths(q), me.id)) return fail("A picture is not one of ours.");
  if (place && (!isUuid(place.paperId) || !isUuid(place.sectionId))) return fail("That paper isn't there, or isn't yours.");

  const db = await supabaseServer();
  const { data: topic, error: topicErr } = await db
    .from("exam_bank_topics").select("id").eq("id", q.topic_id).maybeSingle();
  if (topicErr) return fail(topicErr.message);
  if (!topic) return fail("That topic isn't in the bank.");

  const { data, error } = await db
    .from("exam_bank_questions")
    .insert({
      topic_id: q.topic_id,
      kind: q.kind,
      prompt: q.prompt,
      prompt_images: q.prompt_images,
      prompt_quran: q.prompt_quran,
      options: q.options,
      select_many: q.select_many,
      answer: q.answer,
      marks: q.marks,
      sources: [writtenSource(me.full_name)],
      used_in: [],
      review_status: "clean",
      created_by: me.id,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) return fail("Only teachers can add to the bank.");
    return fail(error.message);
  }
  if (!data) return fail("The question wasn't saved.");

  const question = toBankQuestion(data);
  question.imageUrls = await signExamImages(collectImagePaths(question));

  if (!place) return { ok: true, question, item: null };
  const added = await addItemFromBank(place.paperId, place.sectionId, question.id);
  if (!added.ok) return { ok: true, question, item: null, addError: added.error };
  return { ok: true, question, item: added.item };
}

/**
 * "Keep this question out of the bank": the question goes onto the paper
 * only. Made as a blank question and then filled in, so the paper checks
 * (draft, its own section) are the ones every other edit goes through; if
 * the fill is refused, the blank is taken off again.
 */
export async function addCustomItem(
  paperId: string,
  sectionId: string,
  input: unknown,
): Promise<Result<{ item: PaperItem; imageUrls: Record<string, string> }>> {
  const me = await teacher();
  if (!me.ok) return me;
  // The paper's copy needs no topic; borrow a placeholder so the same checks apply.
  const clean = cleanNewQuestion({ ...(typeof input === "object" && input ? input : {}), topic_id: "paper-only" });
  if (!clean.ok) return clean;
  const q = clean.value;
  if (!ownPictures(collectImagePaths(q), me.id)) return fail("A picture is not one of ours.");

  const blank = await addBlankItem(paperId, sectionId, q.kind);
  if (!blank.ok) return blank;
  const patch = {
    kind: q.kind,
    prompt: q.prompt,
    prompt_images: q.prompt_images,
    prompt_quran: q.prompt_quran,
    options: q.options,
    select_many: q.select_many,
    answer: q.answer,
    marks: q.marks,
    answer_lines: answerLinesFor(q.kind, q.marks),
  };
  const filled = await updateItem(blank.item.id, patch);
  if (!filled.ok) {
    await removeItem(blank.item.id);
    return filled;
  }
  const imageUrls = await signExamImages(collectImagePaths(q));
  return { ok: true, item: { ...blank.item, ...patch }, imageUrls };
}

/** A signed URL for one of the caller's own uploads, to show it in the form. Never any other path. */
export async function signNewQuestionImage(path: string): Promise<Result<{ url: string }>> {
  const me = await teacher();
  if (!me.ok) return me;
  if (!isOwnUpload(path, me.id)) return fail("A picture is not one of ours.");
  const urls = await signExamImages([path]);
  const url = urls[path];
  if (!url) return fail("The picture didn't upload. Try again.");
  return { ok: true, url };
}
