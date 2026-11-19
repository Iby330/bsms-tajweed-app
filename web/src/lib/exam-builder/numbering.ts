import type { PaperItem, Section } from "./types";

/**
 * Numbering and totals for a paper. Typed on the few fields each needs so the
 * workspace's optimistic client state can use them as well as loaded rows.
 */
type SectionLike = Pick<Section, "id" | "kind" | "practical">;
type ItemLike = Pick<PaperItem, "id" | "section_id" | "position" | "marks">;

/**
 * Question numbers, item id → number. As on last year's papers the count
 * restarts at 1 in each section, in `position` order. An item whose section is
 * not on the paper gets no number.
 */
export function numberItems(
  sections: Pick<Section, "id">[],
  items: Pick<PaperItem, "id" | "section_id" | "position">[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const section of sections) {
    items
      .filter((i) => i.section_id === section.id)
      .sort((a, b) => a.position - b.position)
      .forEach((item, n) => { out[item.id] = n + 1; });
  }
  return out;
}

/** A question section adds up its items' marks; a practical section is its table's marks. */
export function sectionTotal(section: SectionLike, items: Pick<ItemLike, "section_id" | "marks">[]): number {
  if (section.kind === "practical") return section.practical?.marks ?? 0;
  return round1(items.filter((i) => i.section_id === section.id).reduce((sum, i) => sum + i.marks, 0));
}

/** "Max Marks": every section's total. Items in a section not on the paper do not count. */
export function paperTotal(sections: SectionLike[], items: Pick<ItemLike, "section_id" | "marks">[]): number {
  return round1(sections.reduce((sum, s) => sum + sectionTotal(s, items), 0));
}

/** 3 → "3", 2.5 → "2.5". Marks are whole or half, never finer. */
export function formatMarks(n: number): string {
  return String(round1(n));
}

/** "(1 mark)", "(2 marks)", "(1.5 marks)": as printed at the right of each question. */
export function marksLabel(n: number): string {
  return `(${formatMarks(n)} ${round1(n) === 1 ? "mark" : "marks"})`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
