"use server";

/**
 * Exam Builder server actions: every write to a paper, its sections and its
 * questions. Not the end-of-term MARK actions (`lib/exams/actions.ts`).
 *
 * Each action checks its ids are uuids, that the caller is a teacher, and —
 * for anything that changes a paper's content — that the paper is still a
 * draft ("Reopen the paper to change it."). Row level security (0152) checks
 * again that the paper is the caller's own or the caller is an admin, so a
 * paper the caller may not touch reads as "not found".
 *
 * Expected failures come back as `{ ok: false, error }`, never as a throw, so
 * the workspace can show them inline.
 *
 * Revalidation, deliberately sparing. In Next 16 ANY `revalidatePath` inside
 * a server action re-renders the route the caller is on, whatever path it
 * names (see `pathWasRevalidated` in next/dist/server/web/spec-extension/
 * revalidate.js: "TODO: only revalidate if the path matches"). On the
 * workspace that means re-reading the whole bank and re-signing every
 * picture after each click, for nothing: the workspace keeps its own
 * optimistic state. So the edits made from the workspace revalidate nothing.
 * The paper list, the bank page and the workspace are all `force-dynamic`,
 * and a dynamic page is fetched fresh on every navigation, so the list's
 * counts are right the next time it is opened. Only the actions called FROM
 * the list (create, delete) revalidate it, as a page: it is cheap.
 *
 * Only async functions may be exported from a "use server" file: the pure
 * checks live in ./validate and ./parse.
 */
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/teacher/guards";
import { DEFAULT_NOTES, DEFAULT_SECTIONS } from "./labels";
import { toPaperItem, toSection } from "./parse";
import type { McqOption, Paper, PaperItem, Practical, QuestionKind, Result, Section, SectionKind } from "./types";
import {
  answerLinesFor, cleanItemPatch, cleanPaperPatch, cleanSectionPatch, isUuid, moved, renumbered,
} from "./validate";

type Db = Awaited<ReturnType<typeof supabaseServer>>;
type Fail = { ok: false; error: string };

const PATH = "/teacher/exam-builder";
const FINAL = "Reopen the paper to change it.";
const NO_PAPER = "That paper isn't there, or isn't yours.";
const NO_SECTION = "That section isn't on this paper.";
const NO_ITEM = "That question isn't there, or isn't yours.";

const fail = (error: string): Fail => ({ ok: false, error });

/** Refresh the paper list (a cheap page). Only for actions called from the list itself. */
function revalidateList() {
  revalidatePath(PATH);
}

/** A database refusal in words a teacher can act on. */
function dbFail(error: { message: string; code?: string }): Fail {
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return fail("You can only change your own papers.");
  }
  return fail(error.message);
}

/** The signed-in teacher, or a refusal. */
async function teacher(): Promise<{ ok: true; id: string } | Fail> {
  try {
    const me = await requireTeacher();
    return { ok: true, id: me.id };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Teachers only.");
  }
}

/** The paper exists, the caller can see it, and it is still a draft. */
async function draftPaper(db: Db, paperId: string): Promise<{ ok: true } | Fail> {
  const { data, error } = await db.from("exam_papers").select("id, status").eq("id", paperId).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail(NO_PAPER);
  if (data.status === "final") return fail(FINAL);
  return { ok: true };
}

/** Rewrite positions 1..n for rows already in the order they should read. */
async function writePositions(
  db: Db,
  table: "exam_paper_sections" | "exam_paper_items",
  ordered: { id: string; position: number }[],
): Promise<{ ok: true } | Fail> {
  const writes = renumbered(ordered);
  const results = await Promise.all(
    writes.map((w) => db.from(table).update({ position: w.position }).eq("id", w.id)),
  );
  const bad = results.find((r) => r.error);
  return bad?.error ? dbFail(bad.error) : { ok: true };
}

async function sectionsOf(db: Db, paperId: string) {
  return db.from("exam_paper_sections").select("id, position").eq("paper_id", paperId).order("position").order("id");
}

async function itemsOf(db: Db, sectionId: string) {
  return db.from("exam_paper_items").select("id, position").eq("section_id", sectionId).order("position").order("id");
}

/** The next free position at the end of a section. */
async function nextItemPosition(db: Db, sectionId: string): Promise<{ ok: true; position: number } | Fail> {
  const { data, error } = await db
    .from("exam_paper_items").select("position").eq("section_id", sectionId)
    .order("position", { ascending: false }).limit(1);
  if (error) return dbFail(error);
  return { ok: true, position: (data?.[0]?.position ?? 0) + 1 };
}

/** A section of THIS paper that holds questions. */
async function questionSection(db: Db, paperId: string, sectionId: string): Promise<{ ok: true } | Fail> {
  const { data, error } = await db
    .from("exam_paper_sections").select("id, paper_id, kind").eq("id", sectionId).maybeSingle();
  if (error) return dbFail(error);
  if (!data || data.paper_id !== paperId) return fail(NO_SECTION);
  if (data.kind !== "questions") return fail("Questions go in a question section, not the practical table.");
  return { ok: true };
}

/** A section row and a check that its paper is a draft. */
async function editableSection(db: Db, id: string) {
  const { data, error } = await db
    .from("exam_paper_sections").select("id, paper_id, kind, position").eq("id", id).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail("That section isn't there, or isn't yours.");
  const paper = await draftPaper(db, data.paper_id);
  if (!paper.ok) return paper;
  return { ok: true as const, section: data };
}

/** An item row and a check that its paper is a draft. */
async function editableItem(db: Db, id: string) {
  const { data, error } = await db
    .from("exam_paper_items").select("id, paper_id, section_id, position, kind, options").eq("id", id).maybeSingle();
  if (error) return dbFail(error);
  if (!data) return fail(NO_ITEM);
  const paper = await draftPaper(db, data.paper_id);
  if (!paper.ok) return paper;
  return { ok: true as const, item: data };
}

const emptyOptions = (): McqOption[] =>
  Array.from({ length: 4 }, () => ({ text: "", image: null, correct: false }));

// ── papers ─────────────────────────────────────────────────────────────────

/** A new draft paper owned by the caller, with last year's notes and three sections. */
export async function createPaper(): Promise<Result<{ id: string }>> {
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();

  const { data, error } = await db
    .from("exam_papers").insert({ owner_id: me.id, notes: [...DEFAULT_NOTES] }).select("id").single();
  if (error) return dbFail(error);
  if (!data) return fail("The paper wasn't created.");

  const { error: secErr } = await db.from("exam_paper_sections").insert(
    DEFAULT_SECTIONS.map((s, i) => ({
      paper_id: data.id,
      position: i + 1,
      title: s.title,
      kind: s.kind,
      practical: s.practical ? { ...s.practical, columns: [...s.practical.columns] } : null,
    })),
  );
  if (secErr) {
    // Don't leave a paper with no sections behind.
    await db.from("exam_papers").delete().eq("id", data.id);
    return dbFail(secErr);
  }
  revalidateList();
  return { ok: true, id: data.id };
}

/** Change the header: title, date, duration, code, season, notes. */
export async function updatePaper(
  id: string,
  patch: Partial<Pick<Paper, "title" | "date_label" | "duration_label" | "code" | "season" | "notes">>,
): Promise<Result> {
  if (!isUuid(id)) return fail(NO_PAPER);
  const clean = cleanPaperPatch(patch);
  if (!clean.ok) return clean;
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const paper = await draftPaper(db, id);
  if (!paper.ok) return paper;

  const { error } = await db
    .from("exam_papers").update({ ...clean.patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return dbFail(error);
  return { ok: true };
}

/**
 * Delete a draft paper with its sections and questions. A final paper must
 * be reopened first, which also lifts its "used in" stamp from the bank.
 */
export async function deletePaper(id: string): Promise<Result> {
  if (!isUuid(id)) return fail(NO_PAPER);
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const paper = await draftPaper(db, id);
  if (!paper.ok) return paper.error === FINAL ? fail("Reopen the paper before deleting it.") : paper;

  const { data, error } = await db.from("exam_papers").delete().eq("id", id).select("id");
  if (error) return dbFail(error);
  if (!data?.length) return fail(NO_PAPER);
  revalidateList();
  return { ok: true };
}

/** Mark the paper final (stamps its bank questions "EOT1 26/27") or reopen it. Returns the label. */
export async function setPaperFinal(id: string, final: boolean): Promise<Result<{ label: string }>> {
  if (!isUuid(id)) return fail(NO_PAPER);
  if (typeof final !== "boolean") return fail("Final or not?");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const { data, error } = await db.rpc("exam_paper_set_final", { p_paper: id, p_final: final });
  if (error) return dbFail(error);
  return { ok: true, label: typeof data === "string" ? data : "" };
}

// ── sections ───────────────────────────────────────────────────────────────

/** A new section at the end of the paper: "New section", or a practical table. */
export async function addSection(paperId: string, kind: SectionKind): Promise<Result<{ section: Section }>> {
  if (!isUuid(paperId)) return fail(NO_PAPER);
  if (kind !== "questions" && kind !== "practical") return fail("A section holds questions or the practical table.");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const paper = await draftPaper(db, paperId);
  if (!paper.ok) return paper;

  const { data: last, error: lastErr } = await db
    .from("exam_paper_sections").select("position").eq("paper_id", paperId)
    .order("position", { ascending: false }).limit(1);
  if (lastErr) return dbFail(lastErr);
  const template = DEFAULT_SECTIONS.find((s) => s.kind === "practical")?.practical;
  const practical: Practical | null =
    kind === "practical" && template ? { ...template, columns: [...template.columns] } : null;

  const { data, error } = await db
    .from("exam_paper_sections")
    .insert({
      paper_id: paperId,
      position: (last?.[0]?.position ?? 0) + 1,
      title: kind === "practical" ? "Practical Component" : "New section",
      kind,
      practical,
    })
    .select("*")
    .single();
  if (error) return dbFail(error);
  if (!data) return fail("The section wasn't added.");
  return { ok: true, section: toSection(data) };
}

/** Rename a section, or change a practical section's table. */
export async function updateSection(id: string, patch: { title?: string; practical?: Practical }): Promise<Result> {
  if (!isUuid(id)) return fail("That section isn't there, or isn't yours.");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableSection(db, id);
  if (!found.ok) return found;
  const clean = cleanSectionPatch(patch, found.section.kind === "practical");
  if (!clean.ok) return clean;

  const { error } = await db.from("exam_paper_sections").update(clean.patch).eq("id", id);
  if (error) return dbFail(error);
  return { ok: true };
}

/** Remove a section and every question in it; the rest close up. */
export async function removeSection(id: string): Promise<Result> {
  if (!isUuid(id)) return fail("That section isn't there, or isn't yours.");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableSection(db, id);
  if (!found.ok) return found;

  const { error } = await db.from("exam_paper_sections").delete().eq("id", id);
  if (error) return dbFail(error);
  const { data: rest, error: restErr } = await sectionsOf(db, found.section.paper_id);
  if (restErr) return dbFail(restErr);
  const written = await writePositions(db, "exam_paper_sections", rest ?? []);
  if (!written.ok) return written;
  return { ok: true };
}

/** Swap a section with its neighbour. At either end it stays put. */
export async function moveSection(id: string, dir: "up" | "down"): Promise<Result> {
  if (!isUuid(id)) return fail("That section isn't there, or isn't yours.");
  if (dir !== "up" && dir !== "down") return fail("Up or down?");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableSection(db, id);
  if (!found.ok) return found;

  const { data: all, error } = await sectionsOf(db, found.section.paper_id);
  if (error) return dbFail(error);
  const order = moved(all ?? [], id, dir);
  if (!order) return { ok: true };
  const written = await writePositions(db, "exam_paper_sections", order);
  if (!written.ok) return written;
  return { ok: true };
}

// ── questions on the paper ─────────────────────────────────────────────────

/**
 * Copy a bank question onto the paper, at the end of a question section of
 * that paper. The copy is the paper's own from then on. A paper holds one
 * copy of a bank question.
 */
export async function addItemFromBank(
  paperId: string,
  sectionId: string,
  bankQuestionId: string,
): Promise<Result<{ item: PaperItem }>> {
  if (!isUuid(paperId)) return fail(NO_PAPER);
  if (!isUuid(sectionId)) return fail(NO_SECTION);
  if (!isUuid(bankQuestionId)) return fail("That question isn't in the bank.");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const paper = await draftPaper(db, paperId);
  if (!paper.ok) return paper;
  const section = await questionSection(db, paperId, sectionId);
  if (!section.ok) return section;

  const { data: q, error: qErr } = await db
    .from("exam_bank_questions")
    .select("id, kind, prompt, prompt_images, prompt_quran, options, select_many, answer, marks, archived")
    .eq("id", bankQuestionId).maybeSingle();
  if (qErr) return dbFail(qErr);
  if (!q || q.archived) return fail("That question isn't in the bank.");

  const { data: dup, error: dupErr } = await db
    .from("exam_paper_items").select("id").eq("paper_id", paperId).eq("bank_question_id", bankQuestionId).limit(1);
  if (dupErr) return dbFail(dupErr);
  if (dup?.length) return fail("That question is already on this paper.");

  const next = await nextItemPosition(db, sectionId);
  if (!next.ok) return next;
  const kind: QuestionKind = q.kind === "mcq" ? "mcq" : "short";
  const marks = typeof q.marks === "number" && q.marks > 0 ? q.marks : 1;

  const { data, error } = await db
    .from("exam_paper_items")
    .insert({
      paper_id: paperId,
      section_id: sectionId,
      position: next.position,
      bank_question_id: q.id,
      kind,
      prompt: q.prompt,
      prompt_images: q.prompt_images ?? [],
      prompt_quran: q.prompt_quran,
      options: q.options,
      select_many: q.select_many,
      answer: q.answer,
      marks,
      answer_lines: answerLinesFor(kind, marks),
    })
    .select("*")
    .single();
  if (error) return dbFail(error);
  if (!data) return fail("The question wasn't added.");
  return { ok: true, item: toPaperItem(data) };
}

/** An empty question written straight onto the paper (not into the bank). */
export async function addBlankItem(
  paperId: string,
  sectionId: string,
  kind: QuestionKind,
): Promise<Result<{ item: PaperItem }>> {
  if (!isUuid(paperId)) return fail(NO_PAPER);
  if (!isUuid(sectionId)) return fail(NO_SECTION);
  if (kind !== "mcq" && kind !== "short") return fail("A question is multiple choice or short answer.");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const paper = await draftPaper(db, paperId);
  if (!paper.ok) return paper;
  const section = await questionSection(db, paperId, sectionId);
  if (!section.ok) return section;
  const next = await nextItemPosition(db, sectionId);
  if (!next.ok) return next;

  const { data, error } = await db
    .from("exam_paper_items")
    .insert({
      paper_id: paperId,
      section_id: sectionId,
      position: next.position,
      bank_question_id: null,
      kind,
      prompt: "New question",
      prompt_images: [],
      options: kind === "mcq" ? emptyOptions() : null,
      select_many: false,
      answer: null,
      marks: 1,
      answer_lines: answerLinesFor(kind, 1),
    })
    .select("*")
    .single();
  if (error) return dbFail(error);
  if (!data) return fail("The question wasn't added.");
  return { ok: true, item: toPaperItem(data) };
}

/**
 * Edit the paper's copy of a question. Turning a question into multiple
 * choice with no options gives it four empty ones.
 */
export async function updateItem(
  id: string,
  patch: Partial<Pick<PaperItem,
    "prompt" | "options" | "select_many" | "answer" | "marks" | "answer_lines" | "prompt_quran" | "prompt_images" | "kind">>,
): Promise<Result> {
  if (!isUuid(id)) return fail(NO_ITEM);
  const clean = cleanItemPatch(patch);
  if (!clean.ok) return clean;
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableItem(db, id);
  if (!found.ok) return found;

  const update = { ...clean.patch };
  if (update.kind === "mcq" && update.options === undefined && !Array.isArray(found.item.options)) {
    update.options = emptyOptions();
  }
  const { error } = await db.from("exam_paper_items").update(update).eq("id", id);
  if (error) return dbFail(error);
  return { ok: true };
}

/** Take a question off the paper; the rest of its section closes up. */
export async function removeItem(id: string): Promise<Result> {
  if (!isUuid(id)) return fail(NO_ITEM);
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableItem(db, id);
  if (!found.ok) return found;

  const { error } = await db.from("exam_paper_items").delete().eq("id", id);
  if (error) return dbFail(error);
  const { data: rest, error: restErr } = await itemsOf(db, found.item.section_id);
  if (restErr) return dbFail(restErr);
  const written = await writePositions(db, "exam_paper_items", rest ?? []);
  if (!written.ok) return written;
  return { ok: true };
}

/** Swap a question with its neighbour in the section. At either end it stays put. */
export async function moveItem(id: string, dir: "up" | "down"): Promise<Result> {
  if (!isUuid(id)) return fail(NO_ITEM);
  if (dir !== "up" && dir !== "down") return fail("Up or down?");
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableItem(db, id);
  if (!found.ok) return found;

  const { data: all, error } = await itemsOf(db, found.item.section_id);
  if (error) return dbFail(error);
  const order = moved(all ?? [], id, dir);
  if (!order) return { ok: true };
  const written = await writePositions(db, "exam_paper_items", order);
  if (!written.ok) return written;
  return { ok: true };
}

/** Move a question to the end of another question section of the same paper. */
export async function moveItemToSection(id: string, sectionId: string): Promise<Result> {
  if (!isUuid(id)) return fail(NO_ITEM);
  if (!isUuid(sectionId)) return fail(NO_SECTION);
  const me = await teacher();
  if (!me.ok) return me;
  const db = await supabaseServer();
  const found = await editableItem(db, id);
  if (!found.ok) return found;
  const from = found.item.section_id;
  if (from === sectionId) return { ok: true };
  const target = await questionSection(db, found.item.paper_id, sectionId);
  if (!target.ok) return target;
  const next = await nextItemPosition(db, sectionId);
  if (!next.ok) return next;

  const { error } = await db
    .from("exam_paper_items").update({ section_id: sectionId, position: next.position }).eq("id", id);
  if (error) return dbFail(error);

  for (const s of [from, sectionId]) {
    const { data: rows, error: rowsErr } = await itemsOf(db, s);
    if (rowsErr) return dbFail(rowsErr);
    const written = await writePositions(db, "exam_paper_items", rows ?? []);
    if (!written.ok) return written;
  }
  return { ok: true };
}
