/**
 * The admin review page's filtering and counting. Pure, so the table and its
 * tests share it.
 */
import type { BankQuestion, Topic } from "@/lib/exam-builder/types";

/** Which pile the list shows. "all" is every question not binned. */
export type ReviewView = "check" | "approved" | "clean" | "all" | "binned";

export type ReviewFilters = {
  view: ReviewView;
  noAnswer: boolean;
  hasPicture: boolean;
  /** A rule, or a series (matches every rule in it). "" = any. */
  topicId: string;
  kind: "" | "mcq" | "short";
  /** A `sources[].label`. "" = any. */
  source: string;
  text: string;
};

export const DEFAULT_FILTERS: ReviewFilters = {
  view: "check", noAnswer: false, hasPicture: false, topicId: "", kind: "", source: "", text: "",
};

export type ReviewCounts = {
  all: number; check: number; approved: number; clean: number; noAnswer: number; binned: number;
};

/**
 * A multiple-choice question is answered by its ticked option, not by answer
 * text (which is null for almost all of them), so counting on `answer` alone
 * reported 225 unanswered questions when the real figure was 51.
 */
export const hasAnswer = (q: Pick<BankQuestion, "answer" | "kind" | "options">) =>
  q.kind === "mcq"
    ? (q.options ?? []).some((o) => o.correct) || !!q.answer?.trim()
    : !!q.answer?.trim();

export function hasPicture(q: Pick<BankQuestion, "prompt_images" | "options">): boolean {
  return q.prompt_images.length > 0 || (q.options ?? []).some((o) => !!o.image);
}

export function reviewCounts(questions: BankQuestion[]): ReviewCounts {
  const c: ReviewCounts = { all: 0, check: 0, approved: 0, clean: 0, noAnswer: 0, binned: 0 };
  for (const q of questions) {
    if (q.archived) { c.binned++; continue; }
    c.all++;
    c[q.review_status]++;
    if (!hasAnswer(q)) c.noAnswer++;
  }
  return c;
}

/** Every source label in the set, in a stable, readable order. */
export function sourceLabels(questions: BankQuestion[]): string[] {
  const set = new Set<string>();
  for (const q of questions) for (const s of q.sources) set.add(s.label);
  return [...set].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

const norm = (s: string) => s.normalize("NFC").toLowerCase();

/** Ids a topic filter matches: the topic itself and, for a series, every rule in it. */
export function topicIds(topicId: string, topics: Topic[]): Set<string> {
  if (!topicId) return new Set();
  return new Set([topicId, ...topics.filter((t) => t.parent_id === topicId).map((t) => t.id)]);
}

/**
 * A predicate for the current filters. Text matches the prompt, the answer,
 * the options, the review note and the source labels, case-insensitively.
 */
export function reviewMatcher(f: ReviewFilters, topics: Topic[]) {
  const ids = topicIds(f.topicId, topics);
  const needle = norm(f.text.trim());
  return (q: BankQuestion): boolean => {
    if (f.view === "binned") { if (!q.archived) return false; }
    else {
      if (q.archived) return false;
      if (f.view !== "all" && q.review_status !== f.view) return false;
    }
    if (f.noAnswer && hasAnswer(q)) return false;
    if (f.hasPicture && !hasPicture(q)) return false;
    if (ids.size && !ids.has(q.topic_id)) return false;
    if (f.kind && q.kind !== f.kind) return false;
    if (f.source && !q.sources.some((s) => s.label === f.source)) return false;
    if (needle) {
      const hay = [
        q.prompt, q.answer ?? "", q.review_note ?? "",
        ...(q.options ?? []).map((o) => o.text), ...q.sources.map((s) => s.label),
      ].join("\n");
      if (!norm(hay).includes(needle)) return false;
    }
    return true;
  };
}

/** True when anything beyond the pile is narrowing the list. */
export function isNarrowed(f: ReviewFilters): boolean {
  return f.noAnswer || f.hasPicture || !!f.topicId || !!f.kind || !!f.source || !!f.text.trim();
}
