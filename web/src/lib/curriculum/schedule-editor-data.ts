import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { readAll } from "@/lib/supabase/read-all";
import { TERMS, sessionDates, termIdFor, termSessions, timetableFor, type Section } from "@/lib/attendance/calendar";
import { londonDate } from "@/lib/attendance/session";
import { getClassSchedule } from "./queries";
import { moduleTitle, type ClassSchedule } from "./tree";

/** One item of a class's schedule, as the teacher's schedule lists it. */
export type EditorItem = {
  courseId: string;
  ordinal: number;
  title: string;
  lessonId: string | null;
  hasVideo: boolean;
  homework: { id: string; number: number } | null;
  /** Hand-ins from this class: in, marked, still flagged late. */
  handedIn: number;
  marked: number;
  late: number;
};

/** An item of a course the class does not take, which can be added. */
export type LibraryItem = {
  courseId: string;
  courseLabel: string;
  ordinal: number;
  title: string;
  hasVideo: boolean;
  hwNumber: number | null;
};

export type EditorWeek = { number: number; classDate: string | null };

export type EditorData = {
  classId: string;
  className: string;
  section: string;
  students: number;
  schedule: ClassSchedule;
  items: EditorItem[];
  library: LibraryItem[];
  /** Teacher id → name, for "changed by". */
  names: Record<string, string>;
  /** Each term's weeks, with the class's tajweed day for the label. */
  terms: { id: number; weeks: EditorWeek[] }[];
  currentTerm: number;
  /** Every teaching day of the class, ISO dates, for the date picker's dots. */
  classDays: string[];
  now: string;
};

/**
 * Everything the teacher's schedule needs for one class, read as the teacher
 * (RLS hands teachers every row). Null when the class has no syllabus.
 */
export async function getScheduleEditorData(classId: string): Promise<EditorData | null> {
  const db = await supabaseServer();
  const [schedule, { data: cls }, { count: students }] = await Promise.all([
    getClassSchedule(classId),
    db.from("classes").select("id, name, section").eq("id", classId).maybeSingle(),
    db.from("profiles").select("id", { count: "exact", head: true })
      .eq("class_id", classId).eq("role", "student").eq("is_active", true),
  ]);
  if (!schedule || !cls) return null;

  const [{ data: lessons }, { data: homeworks }, { data: courses }, { data: roster }, { data: resources }] = await Promise.all([
    db.from("lessons").select("id, course_id, ordinal, title, youtube_id, position"),
    db.from("homeworks").select("id, course_id, ordinal, number, title"),
    db.from("courses").select("id, key, label, position"),
    db.from("profiles").select("id").eq("class_id", classId).eq("role", "student").eq("is_active", true),
    db.from("class_resources").select("course_id").eq("class_id", classId),
  ]);

  const scheduled = new Map(schedule.courses.map((c) => [c.courseId, c]));
  const keyOf = (c: string, o: number) => `${c}|${o}`;
  const byKey = new Map<string, { courseId: string; ordinal: number; lesson?: { id: string; title: string; youtube_id: string | null; position: number }; hw?: { id: string; number: number; title: string } }>();
  const slot = (courseId: string, ordinal: number) => {
    const k = keyOf(courseId, ordinal);
    let s = byKey.get(k);
    if (!s) byKey.set(k, (s = { courseId, ordinal }));
    return s;
  };
  for (const l of lessons ?? []) {
    if (!l.course_id || l.ordinal == null) continue;
    const s = slot(l.course_id, l.ordinal);
    if (!s.lesson || l.position < s.lesson.position) s.lesson = l;
  }
  for (const h of homeworks ?? []) {
    if (!h.course_id || h.ordinal == null) continue;
    slot(h.course_id, h.ordinal).hw = h;
  }

  // hand-ins from this class, per homework
  const mine = [...byKey.values()].filter((s) => {
    const sc = scheduled.get(s.courseId);
    return sc && (!sc.ordinals || sc.ordinals.includes(s.ordinal));
  });
  const hwIds = mine.flatMap((s) => (s.hw ? [s.hw.id] : []));
  const studentIds = (roster ?? []).map((r) => r.id);
  // past PostgREST's 1000-row page: a class's year of hand-ins runs over it
  const subs = hwIds.length && studentIds.length
    ? await readAll<{ homework_id: string; status: string; is_late: boolean }>((from, to) =>
        db.from("submissions").select("id, homework_id, status, is_late")
          .in("homework_id", hwIds).in("student_id", studentIds).in("status", ["submitted", "auto_marked", "approved"])
          .order("id").range(from, to))
    : [];
  const stat = new Map<string, { in: number; marked: number; late: number }>();
  for (const s of subs) {
    const x = stat.get(s.homework_id) ?? { in: 0, marked: 0, late: 0 };
    x.in++; if (s.status === "approved") x.marked++; if (s.is_late) x.late++;
    stat.set(s.homework_id, x);
  }

  const items: EditorItem[] = mine.map((s) => {
    const st = s.hw ? stat.get(s.hw.id) : undefined;
    return {
      courseId: s.courseId, ordinal: s.ordinal,
      title: moduleTitle(s.hw?.title ?? s.lesson?.title ?? "") || `${scheduled.get(s.courseId)!.label} ${s.ordinal}`,
      lessonId: s.lesson?.id ?? null, hasVideo: !!s.lesson?.youtube_id,
      homework: s.hw ? { id: s.hw.id, number: s.hw.number } : null,
      handedIn: st?.in ?? 0, marked: st?.marked ?? 0, late: st?.late ?? 0,
    };
  }).sort((a, b) => a.ordinal - b.ordinal);

  // Everything else in the programme: items of courses this class does not take.
  // a course the class takes, or has as a no-deadline Resource, is not offered
  const taken = new Set([...schedule.courses.filter((c) => !c.added).map((c) => c.courseId), ...(resources ?? []).map((r) => r.course_id)]);
  const added = new Set(mine.map((s) => keyOf(s.courseId, s.ordinal)));
  const courseById = new Map((courses ?? []).map((c) => [c.id, c]));
  const library: LibraryItem[] = [...byKey.values()]
    .filter((s) => !taken.has(s.courseId) && !added.has(keyOf(s.courseId, s.ordinal)) && courseById.has(s.courseId))
    .map((s) => ({
      courseId: s.courseId, courseLabel: courseById.get(s.courseId)!.label, ordinal: s.ordinal,
      title: moduleTitle(s.hw?.title ?? s.lesson?.title ?? "") || `${courseById.get(s.courseId)!.label} ${s.ordinal}`,
      hasVideo: !!s.lesson?.youtube_id, hwNumber: s.hw?.number ?? null,
    }))
    .sort((a, b) => (courseById.get(a.courseId)!.position - courseById.get(b.courseId)!.position) || a.ordinal - b.ordinal);

  // who changed what
  const setters = [...new Set(Object.values(schedule.itemDates ?? {}).flatMap((m) => Object.values(m).map((d) => d.setBy)).filter((x): x is string => !!x))];
  const { data: people } = setters.length
    ? await db.from("profiles").select("id, full_name").in("id", setters)
    : { data: [] as { id: string; full_name: string }[] };

  const timetable = timetableFor(cls.section as Section, cls.name);
  const today = londonDate(new Date());
  const terms = TERMS.map((t) => {
    const days = termSessions(t.id, timetable, "tajweed");
    const listed = schedule.weeksByTerm?.[t.id]?.map((w) => w.number) ?? [];
    const n = Math.max(days.length, ...listed, 0);
    return { id: t.id, weeks: Array.from({ length: n }, (_, i) => ({ number: i + 1, classDate: days[i] ?? null })) };
  });
  const currentTerm = termIdFor(today) ?? TERMS.find((t) => t.startsOn > today)?.id ?? TERMS[TERMS.length - 1].id;

  return {
    classId, className: cls.name, section: cls.section, students: students ?? 0,
    schedule, items, library,
    names: Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name])),
    terms, currentTerm,
    classDays: [...sessionDates(timetable)],
    now: new Date().toISOString(),
  };
}
