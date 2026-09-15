import type { TermId } from "@/lib/attendance/calendar";

/**
 * What each class studies, term by term.
 *
 * This is the per-class curriculum that `coursesForClass()` in catalogue.ts
 * has been promising since it was written — the programme teaches different
 * things to different levels, and until now nothing in the app could say so.
 *
 * It lives in code rather than in the database on purpose, for now. The
 * levelling changes once a year and is decided in a meeting, not in an admin
 * screen; a table would need a UI nobody has asked for, and every change would
 * still be a deploy. When per-class content genuinely needs editing without
 * one, this file is the shape the table should take.
 *
 * ── The awkward bit ──────────────────────────────────────────────────────
 *
 * A course is stored in the database as lessons hanging off WEEKS, and a week
 * belongs to exactly one term. So "mudood" is not a first-class thing; it is
 * "the tajweed lessons in Term 3's weeks". That was fine while every class
 * moved through the same calendar together, and it stops being fine here:
 * group 1 studies mudood in Term 1 while groups 2–4 study it in Term 3.
 *
 * `Course.source` is the seam. It says where a course's lessons currently
 * live, so the syllabus can name a course independently of when any class
 * takes it. What it cannot change is VISIBILITY: a lesson is still revealed by
 * its own week's unlock date, so group 1's mudood lessons do not open early
 * just because their syllabus asks for them early. The calendar therefore
 * names those weeks without linking them.
 *
 * That is a deliberate interim, and it costs nothing today because mudood has
 * no videos uploaded yet either. The real fix is to make a course an ordered
 * list of lessons in its own right and drive unlocking from the syllabus
 * rather than from a global date — a migration and an RLS rewrite, to be done
 * when the videos land.
 */

export type CourseKey =
  | "ghunna"
  | "sifaat_old"
  | "sifaat_new"
  | "mudood"
  | "makharij"
  | "mabadi"
  | "ummul_kitab"
  | "qaidah";

export type Course = {
  label: string;
  /**
   * Where this course's lessons live in the weeks calendar today, or null for
   * a course the app holds no content for at all. A null source is not an
   * error — the calendar still names the topic, it just has nothing to link.
   */
  source: { series: string; termId: TermId } | null;
};

export const COURSES: Readonly<Record<CourseKey, Course>> = {
  ghunna: { label: "Ghunna", source: { series: "tajweed", termId: 1 } },
  sifaat_old: { label: "Ṣifāt", source: { series: "tajweed", termId: 2 } },
  mudood: { label: "Mudūd", source: { series: "tajweed", termId: 3 } },
  mabadi: { label: "Mabādi'", source: { series: "tfp", termId: 3 } },
  ummul_kitab: { label: "Umm al-Kitāb", source: { series: "umm_al_kitab", termId: 1 } },
  // Not in the app yet. Named so a class's calendar can still say what it is
  // being taught; they gain a source the moment the lessons are created.
  sifaat_new: { label: "Ṣifāt (new)", source: null },
  makharij: { label: "Makhārij", source: null },
  qaidah: { label: "Qāʿidah Nūrāniyyah", source: null },
};

/** Groups run 1 (highest) to 5, as the programme ranks them. */
export type GroupId = 1 | 2 | 3 | 4 | 5;

/**
 * The brothers' curriculum, as set for 2026/27.
 *
 * Groups 2 and 3 are identical today and are still written out separately —
 * group 2 is explicitly "TBC based on students' level", so they are expected
 * to diverge, and collapsing them now would only have to be undone.
 *
 * An empty term is a term with no plan yet, not a term off.
 */
export const SYLLABUS: Readonly<Record<GroupId, Readonly<Record<TermId, CourseKey[]>>>> = {
  1: { 1: ["ghunna", "mudood"], 2: ["sifaat_new"], 3: ["makharij", "mabadi"] },
  2: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood", "mabadi"] },
  3: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood", "mabadi"] },
  // Group 4's mabadi is "maybe" — left out until it is decided, because a
  // topic shown and then withdrawn is worse than one added later.
  4: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood"] },
  // Group 5's Term 3 is TBC, and group 5 is itself "TBC based on how students
  // progress".
  5: { 1: ["qaidah"], 2: ["ummul_kitab"], 3: [] },
};

/**
 * Which group each class follows, by `classes.name`.
 *
 * Only the brothers' side has a curriculum so far; the sisters' classes are
 * deliberately absent and their calendars show class days without topics
 * until theirs is decided.
 *
 * Groups 3 and 4 were keyed to "Demo — Abdallah" and "Demo — Ibrahim" while
 * Abdallah and Ibrahim had no brothers' class to hold them. They have one
 * each now — Masjid Al-Umawi and Masjid Quba (migration 0029) — and the
 * entries have moved with them. The demo students those classes used to hold
 * went the other way, into "Demo — Brothers", so the real classes start empty.
 *
 * KEYED BY NAME, which is the reason this file has to be edited whenever a
 * class is renamed: `plan.ts` reads it for both calendar screens, and a key
 * that no longer matches `classes.name` does not fail — it quietly returns no
 * syllabus, and the class's calendar shows its teaching days with no topics
 * on them. The database's own copy in `class_courses` is keyed by id and
 * survives a rename untouched; this one does not.
 */
export const CLASS_GROUP: Readonly<Record<string, GroupId>> = {
  "Masjid An-Nabawi": 1, // Daniyal Thakur
  "Masjid Al-Haram": 2, // Yunus Zafar
  "Masjid Al-Umawi": 3, // Abdallah Ghouse
  "Masjid Quba": 4, // Ibrahim Ramadan
  "Masjid Al-Aqsa": 5, // Moadh Hwessa
};

/** The courses a class takes in a term, or [] when it has no syllabus. */
export function coursesForTerm(className: string | null | undefined, termId: TermId): CourseKey[] {
  const group = className ? CLASS_GROUP[className] : undefined;
  return group === undefined ? [] : [...SYLLABUS[group][termId]];
}

/** True when a class has any curriculum at all — the calendar uses this to
 *  decide whether to draw a plan or stay quiet. */
export function hasSyllabus(className: string | null | undefined): boolean {
  return !!className && className in CLASS_GROUP;
}
