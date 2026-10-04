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
 * takes it. VISIBILITY follows the class, not the row: the database opens item
 * k of a course in the week the class meets it in (`class_item_unlock_at`,
 * 0044), and the calendar reads the same rule through the class's schedule.
 *
 * The database's `class_courses` is the copy RLS enforces; this one names the
 * topics on the calendar. The two must list the same courses in the same terms.
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
  sifaat_new: { label: "Ṣifāt series", source: null },
  makharij: { label: "Makhārij series", source: null },
  qaidah: { label: "Qāʿidah Nūrāniyyah", source: null },
};

/** Groups run 1 (highest) to 5, as the programme ranks them; 6 is the
 *  normal curriculum without Mabādi', which one sisters' class takes. */
export type GroupId = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The curriculum, as set for 2026/27. A group is a plan, not a class: the
 * sisters' classes take the brothers' plans (CLASS_GROUP below).
 *
 * Groups 2, 3 and 4 are identical today and are still written out
 * separately — group 2 is explicitly "TBC based on students' level", so they
 * are expected to diverge, and collapsing them now would only have to be undone.
 *
 * An empty term is a term with no plan yet, not a term off.
 */
export const SYLLABUS: Readonly<Record<GroupId, Readonly<Record<TermId, CourseKey[]>>>> = {
  // Group 1 takes Ghunna, Mudūd and the existing Ṣifāt together in Term 1,
  // several items a week (`class_course_items`); the new Ṣifāt stays in Term 2.
  1: { 1: ["ghunna", "mudood", "sifaat_old"], 2: ["sifaat_new"], 3: ["makharij", "mabadi"] },
  2: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood", "mabadi"] },
  3: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood", "mabadi"] },
  // Group 4 is the same as group 3, Mabādi' included: settled by the
  // programme lead, 2026-10-02 (0043).
  4: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood", "mabadi"] },
  // Group 5 takes Umm al-Kitab alongside Qaidah in Term 1 (programme lead,
  // 2026-10-04: it was filed under Term 2 by mistake); Terms 2 and 3 are TBC.
  5: { 1: ["qaidah", "ummul_kitab"], 2: [], 3: [] },
  // Group 4 without Mabādi' (the matn): Rayyan, programme lead, 2026-10-03.
  6: { 1: ["ghunna", "ummul_kitab"], 2: ["sifaat_old"], 3: ["mudood"] },
};

/**
 * Which group each class follows, by `classes.name`.
 *
 * The sisters' classes follow the brothers' plans (programme lead,
 * 2026-10-03): Zukhruf the new curriculum with An-Nabawi, Salsabeel the normal
 * one, Rayyan the normal one without Mabādi', and Hareer, a basics class, the
 * same as Al-Aqsa. Their weeks run Wednesday to Wednesday (0052).
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
  Zukhruf: 1, // Ola Alghabra
  Salsabeel: 4, // Rezarta Beka
  Hareer: 5, // Sajeda Sufizada
  Rayyan: 6, // Wala Mussa
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
