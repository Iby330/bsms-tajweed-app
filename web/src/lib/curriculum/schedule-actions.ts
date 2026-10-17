"use server";

import { refresh, revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentProfile } from "@/lib/supabase/server";
import { teacherClass } from "@/lib/teacher/scope";
import type { Database } from "@/lib/database.types";
import { getClassSchedule } from "./queries";
import { defaultDueAt, defaultUnlockAt, itemDates, type ClassRule, type ItemDates } from "./tree";

/**
 * A class's own schedule, from the teacher curriculum page (0106).
 *
 * Every write goes through the service role, so the check below is the only
 * guard: a teacher changes their own class, the programme lead any class.
 * After any write that can move a deadline, hand-ins that are now on time
 * lose their late mark (never the other way round), and the count comes back
 * so the screen can say so.
 *
 * Each action returns what it replaced, so the screen's Undo can put it back.
 */

export type ItemKey = { courseId: string; ordinal: number };
/** A field left out is left alone; null clears it. */
export type DatesPatch = { opensAt?: string | null; dueAt?: string | null; held?: boolean | null };
export type ItemRowSnapshot = ItemKey & { row: Omit<ItemDates, "setBy" | "setAt"> | null };
export type ScheduleResult = { error: string | null; cleared?: number; undo?: ItemRowSnapshot[] };

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

async function clearLate(classId: string): Promise<number> {
  const { data } = await supabaseAdmin().rpc("clear_late_for_class", { p_class: classId });
  return typeof data === "number" ? data : 0;
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
    if (opens && due && Date.parse(due) <= Date.parse(opens)) {
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
  const cleared = await clearLate(classId);
  settle();
  return { error: null, cleared, undo };
}

/** Put items' rows back exactly as they were (the screen's Undo). */
export async function restoreItemDates(classId: string, rows: ItemRowSnapshot[]): Promise<ScheduleResult> {
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
  const cleared = await clearLate(classId);
  settle();
  return { error: null, cleared };
}

/** The class default for opening and deadlines; null parts are the calendar's. */
export async function setClassRule(classId: string, rule: ClassRule | null): Promise<ScheduleResult & { before?: ClassRule | null }> {
  const g = await guard(classId);
  if ("error" in g) return g;
  const ok = (w: { weekday: number; time: string } | null | undefined) =>
    !w || (Number.isInteger(w.weekday) && w.weekday >= 0 && w.weekday <= 6 && /^\d\d:\d\d$/.test(w.time));
  if (!ok(rule?.open) || !ok(rule?.due) || (rule?.due && !(rule.due.weeksAfter >= 0 && rule.due.weeksAfter <= 8))) {
    return { error: "That default is not a day and time." };
  }
  const schedule = await getClassSchedule(classId);
  const before = schedule?.rule ?? null;
  const { error } = await supabaseAdmin().from("classes").update({
    open_weekday: rule?.open?.weekday ?? null, open_time: rule?.open?.time ?? null,
    due_weekday: rule?.due?.weekday ?? null, due_time: rule?.due?.time ?? null,
    due_weeks_after: rule?.due?.weeksAfter ?? 0,
  }).eq("id", classId);
  if (error) return { error: error.message };
  const cleared = await clearLate(classId);
  settle();
  return { error: null, cleared, before };
}

/** Add a video or homework from a course the class does not take to one of its weeks. */
export async function addItem(classId: string, item: ItemKey, termId: number, week: number): Promise<ScheduleResult> {
  const g = await guard(classId);
  if ("error" in g) return g;
  if (!Number.isInteger(week) || week < 1 || week > 20) return { error: "Pick a week." };
  const db = supabaseAdmin();
  const { data: takes } = await db.from("class_courses").select("course_id")
    .eq("class_id", classId).eq("course_id", item.courseId).maybeSingle();
  if (takes) return { error: "That course is already on this class's schedule." };
  const { error } = await db.from("class_added_items").upsert({
    class_id: classId, course_id: item.courseId, ordinal: item.ordinal,
    term_id: termId, week_number: week, added_by: g.teacherId, added_at: new Date().toISOString(),
  }, { onConflict: "class_id,course_id,ordinal" });
  if (error) return { error: error.message };
  settle();
  return { error: null };
}

/** Take an added item off the class's schedule, with any dates set on it. */
export async function removeAddedItem(classId: string, item: ItemKey): Promise<ScheduleResult & { week?: number; termId?: number }> {
  const g = await guard(classId);
  if ("error" in g) return g;
  const db = supabaseAdmin();
  const { data: was } = await db.from("class_added_items").select("term_id, week_number")
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle();
  const { data: dates } = await db.from("class_item_dates").select("opens_at, due_at, held")
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal).maybeSingle();
  await db.from("class_item_dates").delete().eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal);
  const { error } = await db.from("class_added_items").delete()
    .eq("class_id", classId).eq("course_id", item.courseId).eq("ordinal", item.ordinal);
  if (error) return { error: error.message };
  settle();
  return {
    error: null, week: was?.week_number, termId: was?.term_id,
    undo: [{ ...item, row: dates ? { opensAt: dates.opens_at, dueAt: dates.due_at, held: dates.held } : null }],
  };
}
