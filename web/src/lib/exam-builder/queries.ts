import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { originalPaths } from "./ayah-proposals";
import { collectImagePaths, signExamImages } from "./images";
import { paperTotal } from "./numbering";
import { toBankQuestion, toPaper, toPaperItem, toSection, type BankRow } from "./parse";
import type { BankQuestion, Paper, PaperItem, Section, Topic } from "./types";
import { isUuid } from "./validate";

/**
 * Exam Builder loaders. Every read goes through the caller's own client, so
 * row level security decides what comes back: teachers read the bank, a
 * paper is visible to its owner, and to every teacher once
 * published. A failed read throws (to the nearest error boundary); a paper
 * the caller cannot see is null.
 *
 * Wrapped in `cache()` so a layout and a page asking for the same thing in one
 * render share one round trip.
 */

/** PostgREST's max-rows on this project. */
const PAGE = 1000;

/** `ownerName`: the teacher who made it, for a published paper shown to the others. */
export type PaperSummary = Paper & { itemCount: number; totalMarks: number; ownerName: string | null };
/**
 * `imageUrls` signs the item's own pictures AND its bank row's original
 * pictures (ayah-proposals), so a picture typeset away, or a slide title
 * replaced by its typed term, can still be looked at ("See the original").
 */
export type PaperItemWithImages = PaperItem & { imageUrls: Record<string, string> };
export type LoadedPaper = {
  paper: Paper;
  sections: Section[];
  items: PaperItemWithImages[];
  /** bank_question_id → that bank question's `used_in`, for the items on this paper. */
  bankUsedIn: Record<string, string[]>;
};

/** Every topic, in `position` order. */
export const loadTopics = cache(async (): Promise<Topic[]> => {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("exam_bank_topics").select("id, parent_id, title, position").order("position").order("id");
  if (error) throw new Error(`Couldn't load the bank's topics: ${error.message}`);
  return data ?? [];
});

/** All bank rows, paged past the 1000-row cap, in a stable order for paging. */
async function bankRows(includeArchived: boolean): Promise<BankRow[]> {
  const db = await supabaseServer();
  const rows: BankRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db.from("exam_bank_questions").select("*");
    if (!includeArchived) q = q.eq("archived", false);
    const { data, error } = await q.order("created_at").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`Couldn't load the question bank: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Rows → BankQuestions, signing every picture in the set in one pass. */
async function withImages(rows: BankRow[]): Promise<BankQuestion[]> {
  const questions = rows.map((r) => toBankQuestion(r));
  // Its own pictures and the originals a typeset swap kept (ayah-proposals).
  const paths = questions.map((q) => [...new Set([...collectImagePaths(q), ...originalPaths(q.id)])]);
  const urls = await signExamImages(paths.flat());
  return questions.map((q, i) => ({ ...q, imageUrls: pick(urls, paths[i]) }));
}

function pick(urls: Record<string, string>, paths: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of paths) if (urls[p]) out[p] = urls[p];
  return out;
}

/** Topic order, then oldest first (rows already arrive by created_at, and sort is stable). */
function byTopic(topics: Topic[]) {
  const pos = new Map(topics.map((t) => [t.id, t.position]));
  return (a: BankQuestion, b: BankQuestion) =>
    (pos.get(a.topic_id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b.topic_id) ?? Number.MAX_SAFE_INTEGER);
}

/** The bank as teachers browse it: every question not archived, by topic then age, pictures signed. */
export const loadBank = cache(async (): Promise<{ topics: Topic[]; questions: BankQuestion[] }> => {
  const [topics, rows] = await Promise.all([loadTopics(), bankRows(false)]);
  const questions = await withImages(rows);
  return { topics, questions: questions.sort(byTopic(topics)) };
});

/** The review list: archived included, `check` first, then by topic and age. */
export const loadBankForReview = cache(async (): Promise<{ topics: Topic[]; questions: BankQuestion[] }> => {
  const [topics, rows] = await Promise.all([loadTopics(), bankRows(true)]);
  const questions = await withImages(rows);
  const topicOrder = byTopic(topics);
  const rank = (q: BankQuestion) => (q.review_status === "check" ? 0 : 1);
  return { topics, questions: questions.sort((a, b) => rank(a) - rank(b) || topicOrder(a, b)) };
});

/**
 * The caller's papers and every shared paper, most recently changed first, each with its question count,
 * its total as "Max Marks" would print it, and who made it.
 */
export const loadMyPapers = cache(async (): Promise<PaperSummary[]> => {
  const db = await supabaseServer();
  const { data, error } = await db
    .from("exam_papers")
    .select("*, owner:profiles!exam_papers_owner_id_fkey(full_name), exam_paper_sections(id, kind, practical), exam_paper_items(section_id, marks)")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load your papers: ${error.message}`);
  return (data ?? []).map(({ exam_paper_sections, exam_paper_items, owner, ...row }) => {
    const sections = (exam_paper_sections ?? []).map((s) =>
      toSection({ ...s, paper_id: row.id, position: 0, title: "" }),
    );
    const items = exam_paper_items ?? [];
    return {
      ...toPaper(row),
      itemCount: items.length,
      totalMarks: paperTotal(sections, items),
      ownerName: owner?.full_name ?? null,
    };
  });
});

/**
 * One paper with its sections (by position) and questions (by section, then
 * position), pictures signed. Null when the id is not a uuid or the caller
 * cannot see the paper.
 */
export const loadPaper = cache(async (paperId: string): Promise<LoadedPaper | null> => {
  if (!isUuid(paperId)) return null;
  const db = await supabaseServer();
  const { data: paperRow, error: paperErr } = await db
    .from("exam_papers").select("*").eq("id", paperId).maybeSingle();
  if (paperErr) throw new Error(`Couldn't load the paper: ${paperErr.message}`);
  if (!paperRow) return null;

  const [secRes, itemRes] = await Promise.all([
    db.from("exam_paper_sections").select("*").eq("paper_id", paperId).order("position").order("id"),
    db.from("exam_paper_items").select("*").eq("paper_id", paperId).order("position").order("id"),
  ]);
  if (secRes.error) throw new Error(`Couldn't load the paper's sections: ${secRes.error.message}`);
  if (itemRes.error) throw new Error(`Couldn't load the paper's questions: ${itemRes.error.message}`);

  const sections = (secRes.data ?? []).map(toSection);
  const sectionPos = new Map(sections.map((s) => [s.id, s.position]));
  const items = (itemRes.data ?? [])
    .map(toPaperItem)
    .sort((a, b) =>
      (sectionPos.get(a.section_id) ?? Number.MAX_SAFE_INTEGER) - (sectionPos.get(b.section_id) ?? Number.MAX_SAFE_INTEGER)
      || a.position - b.position);

  const bankIds = [...new Set(items.flatMap((i) => (i.bank_question_id ? [i.bank_question_id] : [])))];
  const paths = items.map((i) => [...new Set([...collectImagePaths(i), ...originalPaths(i.bank_question_id)])]);
  const [urls, usedRes] = await Promise.all([
    signExamImages(paths.flat()),
    bankIds.length
      ? db.from("exam_bank_questions").select("id, used_in").in("id", bankIds)
      : Promise.resolve({ data: [] as { id: string; used_in: string[] }[], error: null }),
  ]);
  if (usedRes.error) throw new Error(`Couldn't load where the questions were used: ${usedRes.error.message}`);
  const bankUsedIn: Record<string, string[]> = {};
  for (const r of usedRes.data ?? []) bankUsedIn[r.id] = Array.isArray(r.used_in) ? r.used_in : [];

  return {
    paper: toPaper(paperRow),
    sections,
    items: items.map((item, i) => ({ ...item, imageUrls: pick(urls, paths[i]) })),
    bankUsedIn,
  };
});
