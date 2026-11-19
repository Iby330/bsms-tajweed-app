import type { Topic, TopicGroup } from "./types";

const byPosition = (a: Topic, b: Topic) => a.position - b.position;

/**
 * The bank's topic tree: a series you open, then the rules inside it.
 *
 * Parents come in `position` order with their children nested, also by
 * position. A standalone subject (Seerah, Matn, …) is a group with no
 * children and is its own leaf. A child whose parent is missing is shown as
 * its own group rather than dropped, so no question becomes unreachable.
 */
export function groupTopics(rows: Topic[]): TopicGroup[] {
  const ids = new Set(rows.map((r) => r.id));
  const tops = rows.filter((r) => !r.parent_id || !ids.has(r.parent_id)).sort(byPosition);
  return tops.map((topic) => ({
    topic,
    children: rows.filter((r) => r.parent_id === topic.id).sort(byPosition),
  }));
}

/** "Sifaat › Ra" for a rule, "Seerah" for a top-level topic, the raw id if unknown. */
export function topicPath(id: string, rows: Topic[]): string {
  const topic = rows.find((r) => r.id === id);
  if (!topic) return id;
  const parent = topic.parent_id ? rows.find((r) => r.id === topic.parent_id) : undefined;
  return parent ? `${parent.title} › ${topic.title}` : topic.title;
}
