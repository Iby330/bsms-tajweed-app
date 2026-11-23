import type { QuestionKind, Section, TopicGroup } from "./types";

/**
 * The "Add a question" drawer's logic, kept pure so it can be tested: which
 * question type a section probably wants, and where the three steps
 * (series › rule › questions) go next.
 */

/**
 * The type the drawer starts on for a section. Only a starting guess: sections
 * are renamed freely and a question is never forced into or kept out of one,
 * so the drawer always offers "Show all types".
 *
 * The section's own questions decide first: all multiple choice → "mcq", all
 * short answer → "short", a mixture → null. An empty section goes by its
 * title ("multiple choice" / "short answer"). Null means show every type.
 */
export function guessSectionKind(
  section: Pick<Section, "title" | "kind">,
  items: { kind: QuestionKind }[],
): QuestionKind | null {
  if (section.kind !== "questions") return null;
  if (items.length > 0) {
    if (items.every((i) => i.kind === "mcq")) return "mcq";
    if (items.every((i) => i.kind === "short")) return "short";
    return null;
  }
  const t = section.title.toLowerCase();
  const mcq = /multiple[\s-]*choice|\bmcqs?\b/.test(t);
  const short = /short[\s-]*answers?/.test(t);
  if (mcq === short) return null;
  return mcq ? "mcq" : "short";
}

/** "multiple choice" / "short answer": for sentences such as "12 multiple choice". */
export function kindWord(kind: QuestionKind | null): string {
  return kind === "mcq" ? "multiple choice" : kind === "short" ? "short answer" : "questions";
}

/**
 * Where the drawer is. `series` is a top-level topic id; `rule` is one of its
 * rules, `ALL_RULES` for every rule of the series at once, or null while the
 * rules are being chosen. A series with no rules (Seerah, Matn, …) goes
 * straight from the series to its questions.
 */
export type DrawerPlace = { series: string | null; rule: string | null };
export const ALL_RULES = "*";
export const START: DrawerPlace = { series: null, rule: null };

export type DrawerLevel = "series" | "rules" | "questions";

/**
 * Everything the drawer remembers for one section while the paper is open:
 * where it was, the type it shows, the other filters and the search.
 */
export type DrawerView = {
  place: DrawerPlace;
  kind: QuestionKind | null;
  marks: number[];
  unusedOnly: boolean;
  text: string;
};

export const freshView = (kind: QuestionKind | null): DrawerView => ({
  place: START, kind, marks: [], unusedOnly: false, text: "",
});

const groupOf = (place: DrawerPlace, groups: TopicGroup[]) =>
  place.series ? groups.find((g) => g.topic.id === place.series) ?? null : null;

export function drawerLevel(place: DrawerPlace, groups: TopicGroup[]): DrawerLevel {
  const g = groupOf(place, groups);
  if (!g) return "series";
  if (g.children.length === 0) return "questions";
  return place.rule && (place.rule === ALL_RULES || g.children.some((c) => c.id === place.rule)) ? "questions" : "rules";
}

/** The topic ids whose questions the questions step lists (a series id takes in all its rules). */
export function placeTopicIds(place: DrawerPlace, groups: TopicGroup[]): string[] {
  const g = groupOf(place, groups);
  if (!g) return [];
  if (g.children.length === 0 || place.rule === ALL_RULES || !place.rule) return [g.topic.id];
  return [place.rule];
}

/** One step back up: questions → rules (or → series for a one-level series) → series → null (leave). */
export function stepUp(place: DrawerPlace, groups: TopicGroup[]): DrawerPlace | null {
  const level = drawerLevel(place, groups);
  if (level === "series") return null;
  const g = groupOf(place, groups)!;
  if (level === "questions" && g.children.length > 0) return { series: place.series, rule: null };
  return START;
}

/**
 * The rule after the current one in the same series that has something to
 * show (`counts` is questions per topic id under the drawer's filters), or
 * null when there is none or the drawer is not on a single rule.
 */
export function nextRule(place: DrawerPlace, groups: TopicGroup[], counts: Record<string, number>): string | null {
  const g = groupOf(place, groups);
  if (!g || !place.rule || place.rule === ALL_RULES) return null;
  const i = g.children.findIndex((c) => c.id === place.rule);
  if (i < 0) return null;
  return g.children.slice(i + 1).find((c) => (counts[c.id] ?? 0) > 0)?.id ?? null;
}

/**
 * A section's letter for the outline strip: "C" from "Section C - Practical",
 * otherwise its place on the paper (first is A).
 */
export function sectionLetter(title: string, index: number): string {
  const m = /^\s*section\s+([a-z0-9]{1,2})\b/i.exec(title);
  if (m) return m[1].toUpperCase();
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/** "Section A" from "Section A - Multiple Choice Questions"; "this section" for a title without one. */
export function sectionShortName(title: string): string {
  const m = /^\s*section\s+([a-z0-9]{1,2})\b/i.exec(title);
  return m ? `Section ${m[1].toUpperCase()}` : "this section";
}
