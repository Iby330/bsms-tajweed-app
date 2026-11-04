import type { Section } from "@/lib/attendance/calendar";

/** The two real cohorts. `demo` is a training cohort and `ustadhs` is the
 *  teachers' own class; neither belongs on a programme list or board. */
export const PROGRAMME_SECTIONS = ["brothers", "sisters"] as const;
export type ProgrammeSection = (typeof PROGRAMME_SECTIONS)[number];

export function isProgrammeSection(s: string | null | undefined): s is ProgrammeSection {
  return s === "brothers" || s === "sisters";
}

/** The sections a teacher's class lists may show. The ustadhs appear only to
 *  someone in that section, which today means their teacher. */
export function sectionsVisibleTo(viewer: string | null | undefined): Section[] {
  return viewer === "ustadhs" ? ["ustadhs", ...PROGRAMME_SECTIONS] : [...PROGRAMME_SECTIONS];
}

/** How a home page names the viewer's cohort, and whether the programme-wide
 *  board differs from it. A walled-off cohort's "everyone" is itself. */
export function cohortLabels(section: Section | null | undefined) {
  switch (section) {
    case "sisters": return { noun: "sisters", classes: "Sisters' classes", crossSection: true };
    case "demo": return { noun: "demo classes", classes: "Demo classes", crossSection: false };
    case "ustadhs": return { noun: "ustadhs", classes: "Esteemed Ustadhs", crossSection: false };
    default: return { noun: "brothers", classes: "Brothers' classes", crossSection: true };
  }
}
