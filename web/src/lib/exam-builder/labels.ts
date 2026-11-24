import type { Practical, SectionKind } from "./types";

/**
 * "EOT1 26/27": the stamp "Mark as final" adds to each bank question's
 * `used_in`. Must match `exam_paper_set_final` in migration 0152, which builds
 * it as `trim(code) || ' ' || trim(season)`.
 */
export function usedLabel(code: string, season: string): string {
  return `${code.trim()} ${season.trim()}`;
}

/**
 * "End Of Term 1 Exam - Advanced": the printed title with the paper's name
 * after it, for download file names and the print view's document title, so
 * several papers for one exam download as different files. Never printed on
 * the paper itself.
 */
export function namedTitle(paper: { title: string; name: string }): string {
  const title = paper.title.trim() || "Exam paper";
  const name = paper.name.trim();
  return name ? `${title} - ${name}` : title;
}

export type DefaultSection ={ title: string; kind: SectionKind; practical: Practical | null };

/** A new paper's sections, as on last year's EOT2 25/26. All can be renamed, moved or removed. */
export const DEFAULT_SECTIONS: readonly DefaultSection[] = [
  { title: "Section A - Multiple Choice Questions", kind: "questions", practical: null },
  { title: "Section B - Short Answer Questions", kind: "questions", practical: null },
  {
    title: "Section C - Practical Component",
    kind: "practical",
    practical: { rows: 3, marks: 9, columns: ["Verse", "Surah", "Order - before/after"] },
  },
];

/** A new paper's numbered "Note:" lines, last year's wording. */
export const DEFAULT_NOTES: readonly string[] = [
  "Section A is made up of Multiple choice questions. Read carefully and select all correct answers, ensuring all examples you give are from the Qur'an.",
  "Section B consists of short answer questions.",
  "Section C is the practical component and comprises a hifdh test.",
];
