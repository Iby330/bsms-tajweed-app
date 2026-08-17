import { cache } from "react";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";

export type TeacherClass = { id: string; name: string; section: string };

/**
 * A teacher's own class — what the teacher screens narrow down to.
 *
 * This is about usability, not permission. The programme runs one class per
 * teacher, and showing all seven on the register, roster, hifz and homework
 * screens buries a teacher's twenty students in a hundred and forty for no
 * gain. So those screens list this class and drop their class switchers.
 * Nothing here is a security boundary — teachers remain trusted, the RLS
 * policies are unchanged, and cross-class views live on the Classes screen
 * until proper admin accounts arrive.
 *
 * `classes.teacher_id` is the source of truth; `profiles.class_id` is the
 * fallback for a teacher who was given a class but never set as its owner.
 * Returns null when neither says anything — the screens then say so plainly
 * rather than quietly showing someone else's students.
 */
export const teacherClass = cache(async (): Promise<TeacherClass | null> => {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") return null;
  const db = await supabaseServer();

  const { data: owned } = await db
    .from("classes")
    .select("id, name, section")
    .eq("teacher_id", profile.id)
    .maybeSingle();
  if (owned) return owned as TeacherClass;

  if (profile.class_id) {
    const { data: assigned } = await db
      .from("classes")
      .select("id, name, section")
      .eq("id", profile.class_id)
      .maybeSingle();
    if (assigned) return assigned as TeacherClass;
  }
  return null;
});

/**
 * Active students the teacher's screens should list: their own class, or
 * every student when they have no class of their own.
 *
 * That fallback is deliberate. An account with no class is the programme
 * lead rather than a class teacher, and narrowing them to nothing would lock
 * them out of screens they use today. It is the same everything-view the
 * teacher screens had before they were scoped, and the seat a real admin
 * role will eventually take over.
 */
export const teacherRoster = cache(
  async (): Promise<{ id: string; full_name: string }[]> => {
    const cls = await teacherClass();
    const db = await supabaseServer();
    let q = db
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .eq("is_active", true);
    if (cls) q = q.eq("class_id", cls.id);
    const { data } = await q.order("full_name");
    return data ?? [];
  },
);

/** What to call the current scope in a heading. */
export async function scopeLabel(): Promise<string> {
  const cls = await teacherClass();
  return cls?.name ?? "All classes";
}

/**
 * Every class this teacher may look at: the ones in their own section.
 *
 * Teachers cover for each other — someone is away, their class has handed a
 * homework in, and it needs marking — so the homework screens let a teacher
 * switch to a colleague's class rather than pinning them to their own. The
 * section is the boundary: brothers' teachers see the brothers' classes,
 * sisters' the sisters', and the demo accounts see the demo classes and
 * nothing else, which is the point of having them.
 *
 * Like `teacherClass`, this is scoping and not a security boundary — RLS still
 * grants every teacher the whole cohort. It decides what the screens offer.
 */
export const teacherClasses = cache(async (): Promise<TeacherClass[]> => {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") return [];
  const db = await supabaseServer();
  const { data } = await db
    .from("classes")
    .select("id, name, section")
    .eq("section", profile.section)
    .order("name");
  return (data ?? []) as TeacherClass[];
});

/**
 * A link that stays in the current scope.
 *
 * The class has to travel with every link out of a homework screen, or marking
 * a colleague's class ends the moment you open a script: approve it, come back,
 * and you are looking at your own class again. The teacher's own class carries
 * nothing, so ordinary use leaves no query string behind.
 */
export function scopedHref(scope: HomeworkScope, href: string): string {
  const carry = scope.selected
    ? scope.selected.id === scope.own
      ? null
      : scope.selected.id
    : "all";
  if (!carry) return href;
  return `${href}${href.includes("?") ? "&" : "?"}class=${carry}`;
}

export type HomeworkScope = {
  /** The filter's options, in order. */
  classes: TeacherClass[];
  /** The class being looked at, or null for every class in the section. */
  selected: TeacherClass | null;
  students: { id: string; full_name: string }[];
  label: string;
  /** The `?class=` value that needs no query string — the teacher's own. */
  own: string | null;
};

/**
 * Who the homework screens are looking at, given `?class=`.
 *
 * Opens on the teacher's own class, as those screens always have. `all` widens
 * to their whole section; a class id narrows to that class. Anything else — a
 * hand-typed id, a class from another section, a stale link — falls back to
 * their own class rather than 404ing or, worse, honouring it.
 */
export async function homeworkScope(classParam?: string): Promise<HomeworkScope> {
  const [classes, own] = await Promise.all([teacherClasses(), teacherClass()]);

  const selected =
    classParam === "all"
      ? null
      : classes.find((c) => c.id === classParam) ?? own;

  const db = await supabaseServer();
  let q = db
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student")
    .eq("is_active", true);
  if (selected) q = q.eq("class_id", selected.id);
  // No class chosen and no section to fall back on — an account with neither is
  // the programme lead, and narrowing them to nothing would lock them out of
  // screens they use today. Same everything-view teacherRoster() gives them.
  else if (classes.length) q = q.in("class_id", classes.map((c) => c.id));
  const { data } = await q.order("full_name");

  return {
    classes,
    selected,
    students: data ?? [],
    label: selected?.name ?? "All classes",
    own: own?.id ?? null,
  };
}


/**
 * Whether a teacher may OPEN a given class, which is the same section rule
 * `teacherClasses` applies, asked one class at a time.
 *
 * Both exist because they answer different questions. `teacherClasses` builds
 * the set a teacher can work in, for a filter that only ever offers those.
 * This decides how to render a class already on screen: the Classes page lists
 * every class in the programme — knowing there are seven and who teaches them
 * is not the same as reading a roster of somebody else's students, and the
 * list is how a teacher finds a colleague — so it needs a per-row verdict
 * without a query per row.
 *
 * The same caveat as every other guard here: this is usability and
 * blast-radius scoping, not a security boundary. RLS still grants every
 * teacher the whole cohort.
 */
export function canOpenSection(
  viewerSection: string | null | undefined,
  classSection: string | null | undefined,
): boolean {
  return !!viewerSection && !!classSection && viewerSection === classSection;
}

/**
 * How to name a section's staff possessively, mid-sentence. Held as whole
 * phrases rather than bare nouns because "demo" does not take an apostrophe
 * the way the two cohorts do, and gluing one on produced "demo’ teachers".
 */
export const SECTION_POSSESSIVE: Record<string, string> = {
  brothers: "the brothers’",
  sisters: "the sisters’",
  demo: "the demo cohort’s",
};
