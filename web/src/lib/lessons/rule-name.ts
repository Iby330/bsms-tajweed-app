/**
 * The rule a lesson actually teaches, pulled out of its stored title.
 *
 * The titles came in from a spreadsheet import and carry their own numbering
 * twice over — 0009 cleaned up some of the doubling and left the rest:
 *
 *   "Tajweed 6: Tajweed Homework 6 : Ikhfaa Haqiqy "  → "Ikhfaa Haqiqy"
 *   "Tajweed 10: The Heaviness of Laam"               → "The Heaviness of Laam"
 *   "Umm al-Kitab 3 — The Basmala"                    → "The Basmala"
 *
 * The calendar wants the rule and nothing else: "Ghunna 3" tells a student
 * which slot it is, but not what they will be taught, which is the whole
 * question a calendar is being asked.
 *
 * Some titles carry no rule at all — the Ten Fundamental Principles are stored
 * as "HW 1" through "HW 7" — so this returns null rather than inventing one,
 * and the caller falls back to naming the course and its number.
 */

/** Course prefixes that appear before the rule, with or without a number. */
const PREFIX = new RegExp(
  String.raw`^\s*(?:tajweed(?:\s+homework)?|umm\s+al[-\s]kitab|the\s+10\s+fundamental\s+principles)` +
    String.raw`\s*\d*\s*[:—–-]\s*`,
  "i",
);

/** What is left when a title is only its own numbering: "HW 4", "Ep. 2". */
const PLACEHOLDER = /^(?:hw|homework|ep\.?|episode|part)\s*\d*$/i;

export function ruleName(title: string | null | undefined): string | null {
  if (!title) return null;

  // Twice, not once: "Tajweed 6: Tajweed Homework 6 : Ikhfaa Haqiqy" carries
  // the course name on both sides of the first colon. A loop would happily
  // eat a rule that legitimately starts with the course's own name.
  let rest = title.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) rest = rest.replace(PREFIX, "").trim();

  if (!rest || PLACEHOLDER.test(rest)) return null;
  return rest;
}
