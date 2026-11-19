import type { BankQuestion, QuestionKind, Topic } from "./types";

/** The bank panel's filters. Every field is optional; empty means "don't filter". */
export type BankFilter = {
  /** Leaf ids, parent ids (= every rule under it) or standalone subjects. */
  topicIds?: string[];
  /** Any of these mark values. A question with no marks matches none. */
  marks?: number[];
  /** Only questions never set in an exam (`used_in` empty). */
  unusedOnly?: boolean;
  kind?: QuestionKind | null;
  /** Case-insensitive, NFC-normalised match on prompt or answer. */
  text?: string;
};

type Filterable = Pick<BankQuestion, "topic_id" | "kind" | "marks" | "used_in" | "prompt" | "answer">;

const fold = (s: string) => s.normalize("NFC").toLowerCase();

/** The chosen topics plus every child of a chosen parent. */
function expandTopics(ids: string[], topics: Topic[]): Set<string> {
  const out = new Set(ids);
  for (const t of topics) if (t.parent_id && out.has(t.parent_id)) out.add(t.id);
  return out;
}

/**
 * The bank as the filters leave it, in its original order. `topics` is the
 * full topic list, needed to widen a parent to its rules.
 */
export function filterBank<Q extends Filterable>(questions: Q[], filter: BankFilter, topics: Topic[]): Q[] {
  const topicSet = filter.topicIds?.length ? expandTopics(filter.topicIds, topics) : null;
  const marks = filter.marks?.length ? new Set(filter.marks) : null;
  const needle = filter.text ? fold(filter.text.trim()) : "";
  return questions.filter((q) => {
    if (topicSet && !topicSet.has(q.topic_id)) return false;
    if (marks && (q.marks == null || !marks.has(q.marks))) return false;
    if (filter.unusedOnly && q.used_in.length > 0) return false;
    if (filter.kind && q.kind !== filter.kind) return false;
    if (needle && !fold(q.prompt).includes(needle) && !fold(q.answer ?? "").includes(needle)) return false;
    return true;
  });
}

/** The distinct mark values in the bank, ascending, for the marks chips. */
export function markValues(questions: Pick<BankQuestion, "marks">[]): number[] {
  const set = new Set<number>();
  for (const q of questions) if (q.marks != null) set.add(q.marks);
  return [...set].sort((a, b) => a - b);
}

/**
 * Questions per topic id for the tree's counts. A parent counts its own
 * questions plus all of its rules'. Topics with no questions are absent.
 */
export function topicCounts(questions: Pick<BankQuestion, "topic_id">[], topics: Topic[]): Record<string, number> {
  const parentOf = new Map(topics.map((t) => [t.id, t.parent_id]));
  const out: Record<string, number> = {};
  for (const q of questions) {
    out[q.topic_id] = (out[q.topic_id] ?? 0) + 1;
    const parent = parentOf.get(q.topic_id);
    if (parent) out[parent] = (out[parent] ?? 0) + 1;
  }
  return out;
}
