"use server";

import { refresh, revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentProfile } from "@/lib/supabase/server";
import { teacherClass } from "@/lib/teacher/scope";
import type { Database } from "@/lib/database.types";
import { getClassSchedule } from "./queries";
import { defaultDueAt, defaultUnlockAt, itemDates, type ClassRule, type ItemDates } from "./tree";

/**
 * A class's own schedule, from the teacher curriculum page (0108).
 *
 * Every write goes through the service role, so the check below is the only
 * guard: a teacher changes their own class, the programme lead any class.
 * After any write that can move a deadline, hand-ins that are now on time
 * lose their late mark (never the other way round), and which ones comes
 * back, so the screen can say so and its Undo can put the marks back (0109).
 *
 * Each action returns what it replaced, so the screen's Undo can put it back.
 */

export type ItemKey = { courseId: string; ordinal: number };
/** A field left out is left alone; null clears it. */
export type DatesPatch = { opensAt?: string | null; dueAt?: string | null; held?: boolean | null };
export type ItemRowSnapshot = ItemKey & { row: Omit<ItemDates, "setBy" | "setAt"> | null };
export type ScheduleResult = { error: string | null; cleared?: number; clearedIds?: string[]; undo?: ItemRowSnapshot[] };

async function guard(classId: string): Promise<{ error: string } | { teacherId: string }> {
  const me = await currentProfile();
  if (!me || me.role !== "teacher") return { error: "Only teachers can do that." };
  if (me.is_admin) return { teacherId: me.id };
  const own = await teacherClass();
  if (own?.id !== classId) return { error: "You can change your own class's schedule only." };
  return { teacherId: me.id };
}

function settle(): void {
  for (const p of ["/teacher/curriculum", "/teacher/homework", "/teacher/calendar", "/home", "/courses", "/homework", "/calendar", "/progress"]) {
    revalidatePath(p);
  }
  refresh();
}

/** Clears late marks now on time; then, for an Undo, puts back the ones the
 *  change being undone had cleared. */
async function lateMarks(classId: string, restore: string[] = []): Promise<{ cleared: number; clearedIds: string[] }> {
  const db = supabaseAdmin();
  const { data } = await db.rpc("clear_late_for_class_ids", { p_class: classId });
  const ids = (Array.isArray(data) ? data : []) as string[];
  if (restore.length) await db.rpc("restore_late", { p_class: classId, p_ids: restore });
  const cleared = ids.filter((id) => !restore.includes(id));
  return { cleared: cleared.length, clearedIds: cleared };
}

const iso = (v: string | null | undefined) =>
  v === null || v === undefined ? v : Number.isNaN(Date.parse(v)) ? "bad" : new Date(v).toISOString();

/** Set (or clear) dates and holds on one or more items of a class. */
export async function setItemDates(classId: string, items: ItemKey[], patch: DatesPatch): Promise<ScheduleResult> {
  const g = await guard(classId);
  if ("error" in g) return g;
  if (!items.length) return { error: null };
  const opensAt = iso(patch.opensAt), dueAt = iso(patch.dueAt);
  if (opensAt === "bad" || dueAt === "bad") return { error: "That is not a date." };

  const schedule = await getClassSchedule(classId);
  if (!schedule) return { error: "This class has no schedule yet." };

  const db = supabaseAdmin();
  // which items have homework: a video on its own has no deadline to clash with
  const { data: hws } = await db.from("homeworks").select("course_id, ordinal")
    .in("course_id", [...new Set(items.map((i) => i.courseId))]);
  const hasHw = new Set((hws ?? []).map((h) => `${h.course_id}|${h.ordinal}`));
  const undo: ItemRowSnapshot[] = [];
  const upserts: Database["public"]["Tables"]["class_item_dates"]["Insert"][] = [];
  const deletes: ItemKey[] = [];
  for (const it of items) {
    const sc = schedule.courses.find((c) => c.courseId === it.courseId);
    if (!sc || (sc.ordinals && !sc.ordinals.includes(it.ordinal))) return { error: "That item is not on this class's schedule." };
    const cur = itemDates(schedule, it.ordinal, it.courseId);
    undo.push({ ...it, row: cur ? { opensAt: cur.opensAt, dueAt: cur.dueAt, held: cur.held } : null });
    const next = {
      opensAt: opensAt === undefined ? cur?.opensAt ?? null : opensAt,
      dueAt: dueAt === undefined ? cur?.dueAt ?? null : dueAt,
      held: patch.held === undefined ? cur?.held ?? null : patch.held,
    };
    // the deadline has to fall after the opening, whichever of them is the item's own
    const opens = next.opensAt ?? defaultUnlockAt(schedule, sc.termId, it.ordinal, it.courseId);
    const due = next.dueAt ?? defaultDueAt(schedule, sc.termId, it.ordinal, it.courseId, opens);
    if (hasHw.has(`${it.courseId}|${it.ordinal}`) && opens && due && Date.parse(due) <= Date.parse(opens)) {
      return { error: "The deadline would be before it opens. Pick a later deadline or an earlier opening." };
    }
    if (next.opensAt === null && next.dueAt === null && next.held === null) deletes.push(it);
    else upserts.push({
      class_id: classId, course_id: it.courseId, ordinal: it.ordinal,
      opens_at: next.opensAt, due_at: next.dueAt, held: next.held,
      set_by: g.teacherId, set_at: new Date().toISOString(),
    });
  }
  if (upserts.length) {
    const { error } = await db.from("class_item_dates").upsert(upserts, { onConflict: "class_id,course_id,ordinal" });
    if (error) return { error: error.message };
  }
  for (const d of deletes) {
    const { error } = await db.from("class_item_dates").delete()
      .eq("class_id", classId).eq("course_id", d.courseId).eq("ordinal", d.ordinal);
    if (error) return { error: error.message };
  }
  const late = await lateMarks(classId);
  settle();
  return { error: null, ...late, undo };
}

/** Put items' rows back exactly as they were, and the late marks the change
 *  cleared (the screen's Undo). */
export async function restoreItemDates(classId: string, rows: ItemRowSnapshot[], lateIds: string[] = []): Promise<ScheduleResult> {
  const g = await guard(classId);
  if ("error" in g) return g;
  const db = supabaseAdmin();
  for (const r of rows) {
    if (!r.row || (r.row.opensAt === null && r.row.dueAt === null && r.row.held === null)) {
      const { error } = await db.from("class_item_dates").delete()
        .eq("class_id", classId).eq("course_id", r.courseId).eq("ordinal", r.ordinal);
      if (error) return { error: error.message };
    } else {
      const { error } = await db.from("class_item_dates").upsert({
        class_id: classId, course_id: r.courseId, ordinal: r.ordinal,
        opens_at: r.row.opensAt, due_at: r.row.dueAt, held: r.row.held,
        set_by: g.teacherId, set_at: new Date().toISOString(),
      }, { onConflict: "class_id,course_id,ordinal" });
      if (error) return { error: error.message };
    }
  }
  const late = await lateMarks(classId, lateIds);
  settle();
  return { error: null, ...late };
}

/** The class default for opening and deadlines; null parts are the calendar's. */
export async function setClassRule(classId: string, rule: ClassRule | null, lateIds: string[] = []): Promise<ScheduleResult & { before?: ClassRule | null }> {
  const g = await guard(classId);
  if ("error" in g) return g;
  const ok = (w: { weekday: number; time: string } | null | undefined) =>
    !w || (Number.isInteger(w.weekday) && w.weekday >= 0 && w.weekday <= 6 && /^\d\d:\d\d$/.test(w.time));
  if (!ok(rule?.open) || !ok(rule?.due) || (rule?.due && !(rule.due.weeksAfter >= 0 && rule.due.weeksAfter <= 8))) {
    return { error: "That default is not a day and time." };
  }
  const schedule = await getClassSchedule(classId);
  const before = schedule?.rule ?? null;
  // with the new default, every homework that follows it must still open before it is due
  if (schedule) {
    const next = { ...schedule, rule };
    const { data: hws } = await supabaseAdmin().from("homeworks").select("course_id, ordinal, title")
      .in("course_id", schedule.courses.map((c) => c.courseId));
    for (const h of hws ?? []) {
      const sc = schedule.courses.find((c) => c.courseId === h.course_id);
      if (!sc || h.ordinal == null || (sc.ordinals && !sc.ordinals.includes(h.ordinal))) continue;
      const own = itemDates(next, h.ordinal, h.course_id);
      const opens = own?.opensAt ?? defaultUnlockAt(next, sc.termId, h.ordinal, h.course_id);
      const due = own?.dueAt ?? defaultDueAt(next, sc.termId, h.ordinal, h.course_id, opens);
      if (opens && due && Date.parse(due) <= Date.parse(opens)) {
        return { error: `With that default, ${sc.label} ${h.ordinal} would open after its deadline. Pick an earlier opening or a later deadline.` };
      }
    }
  }
  const { error } = await supabaseAdmin().from("classes").update({
    open_weekday: rule?.open?.weekday ?? null, open_time: rule?.open?.time ?? null,
    due_weekday: rule?.due?.weekday ?? null, due_time: rule?.due?.time ?? null,
    due_weeks_after: rule?.due?.weeksAfter ?? 0,
  }).eq("id", classId);
  if (error) return { error: error.message };
  const late = await lateMarks(classId, lateIds);
  settle();
  return { error: null, ...late, before };
}

/** Where an item sat before `placeItem` put it somewhere, for the screen's
 *  Undo: its own row's term and week (`week` null: it had no row of its own;
 *  `termId` null with a week: the course's own term) and its dates row. */
export type Placement = { termId: number | null; week: number | null; dates: ItemRowSnapshot["row"] };

/**
 * Put a video or homework in any week of any term of the class's year.
 *
 * Of a course the class takes, it is that item's own row in
 * `class_course_items`: the week, and the term when it is not the course's
 * (0153). Put back exactly where item k = week k of the course's term would
 * have it, the row is deleted rather than kept as an override that changes
 * nothing. Of a course the class does not take, it is added
 * (`class_added_items`) with that row's own term, whatever term its other
 * added items are in.
 *
 * Either way it starts again on its new week's default dates, not held: dates
 * set for the place it left do not carry over, and that is also what puts a
 * removed item back on the schedule.
 */
export async function placeItem(classId: string, item: ItemKey, termId: number, week: number): Promise<ScheduleResult & { before?: Placement }> {
  const g = await guard(classId);
  if ("error" in g) return g;
  if (!Number.isInteger(week) || week < 1 || week > 20) return { error: "Pick a week." };
  if (![1, 2, 3].includes(termId)) return { error: "Pick a term." };
  const db = supabaseAdmin();
  const key = { class_id: classId, course_id: item.courseId, ordinal: item.ordinal };
  const [{ data: takes }, { data: lesson }, { data: hw }, { data: ownRow }, { data: addedRow }, { data: dates }] = await Promise.all([
    db.from("class_courses").select("term_id").eq("class_id", classId).eq("course_id", item.courseId).maybeSingle(),
    db.from("lessons").select("id").eq("course_id", item.courseId).eq("ordinal", item.ordinal).limit(1),
    db.from("homeworks").select("id").eq("course_id", item.courseId).eq("ordinal", item.ordinal).limit(1),
    db.from("class_course_items").select("term_id, week_number")
      .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle(),
    db.from("class_added_items").select("term_id, week_number")
      .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle(),
    db.from("class_item_dates").select("opens_at, due_at, held")
      .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle(),
  ]);
  if (!lesson?.length && !hw?.length) return { error: "That video or homework could not be found." };
  let was: Pick<Placement, "termId" | "week">;
  if (takes) {
    was = ownRow ? { termId: ownRow.term_id, week: ownRow.week_number } : { termId: null, week: null };
    const sameTerm = termId === takes.term_id;
    const { error } = sameTerm && week === item.ordinal
      // its own week of its own term: no row needed
      ? await db.from("class_course_items").delete()
        .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal)
      : await db.from("class_course_items").upsert({
        ...key, week_number: week, term_id: sameTerm ? null : termId,
      }, { onConflict: "class_id,course_id,ordinal" });
    if (error) return { error: error.message };
  } else {
    was = addedRow ? { termId: addedRow.term_id, week: addedRow.week_number } : { termId: null, week: null };
    const { error } = await db.from("class_added_items").upsert({
      ...key, term_id: termId, week_number: week, added_by: g.teacherId, added_at: new Date().toISOString(),
    }, { onConflict: "class_id,course_id,ordinal" });
    if (error) return { error: error.message };
  }
  // dates set for the week it left do not carry over, and nor does the removal
  const { error: datesErr } = await db.from("class_item_dates").delete()
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal);
  if (datesErr) return { error: datesErr.message };
  const late = await lateMarks(classId);
  settle();
  return {
    error: null, ...late,
    before: { ...was, dates: dates ? { opensAt: dates.opens_at, dueAt: dates.due_at, held: dates.held } : null },
  };
}

/** The old name for `placeItem`, which the schedule screen still calls. */
export async function addItem(classId: string, item: ItemKey, termId: number, week: number): Promise<ScheduleResult & { before?: Placement }> {
  return placeItem(classId, item, termId, week);
}

/** Undo `placeItem`: the item's own row back exactly as it was (none, when it
 *  had none), and its dates row as it was. */
export async function restorePlacement(classId: string, item: ItemKey, before: Placement, lateIds: string[] = []): Promise<ScheduleResult> {
  const g = await guard(classId);
  if ("error" in g) return g;
  const db = supabaseAdmin();
  const { data: takes } = await db.from("class_courses").select("course_id").eq("class_id", classId).eq("course_id", item.courseId).maybeSingle();
  const key = { class_id: classId, course_id: item.courseId, ordinal: item.ordinal };
  let error: { message: string } | null;
  if (before.week === null) {
    ({ error } = await db.from(takes ? "class_course_items" : "class_added_items").delete()
      .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal));
  } else if (takes) {
    ({ error } = await db.from("class_course_items").upsert(
      { ...key, week_number: before.week, term_id: before.termId }, { onConflict: "class_id,course_id,ordinal" }));
  } else {
    // an added row always has its term
    if (before.termId === null) return { error: "There is nothing to put back." };
    ({ error } = await db.from("class_added_items").upsert(
      { ...key, term_id: before.termId, week_number: before.week, added_by: g.teacherId, added_at: new Date().toISOString() },
      { onConflict: "class_id,course_id,ordinal" }));
  }
  if (error) return { error: error.message };
  return restoreItemDates(classId, [{ ...item, row: before.dates }], lateIds);
}

/** Take an added item off the class's schedule, with any dates set on it. */
export async function removeAddedItem(classId: string, item: ItemKey): Promise<ScheduleResult & { week?: number; termId?: number }> {
  const g = await guard(classId);
  if ("error" in g) return g;
  const db = supabaseAdmin();
  const { data: was } = await db.from("class_added_items").select("term_id, week_number")
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle();
  if (!was) return { error: "That item was not added to this class's schedule." };
  const { data: dates } = await db.from("class_item_dates").select("opens_at, due_at, held")
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle();
  const { error: datesErr } = await db.from("class_item_dates").delete()
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal);
  if (datesErr) return { error: datesErr.message };
  const { error } = await db.from("class_added_items").delete()
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal);
  if (error) return { error: error.message };
  settle();
  return {
    error: null, week: was?.week_number, termId: was?.term_id,
    undo: [{ ...item, row: dates ? { opensAt: dates.opens_at, dueAt: dates.due_at, held: dates.held } : null }],
  };
}
