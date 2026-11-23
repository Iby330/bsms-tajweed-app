/**
 * The schedule screen's working copy: what the server last sent, with the
 * teacher's changes applied at once, before the server has answered.
 *
 * Each change is a plain `Op`, applied by `apply`. The ops mirror the server
 * actions in `schedule-actions.ts` closely enough that a row does not jump
 * when the real data lands: they change `schedule` the way `scheduleFromRows`
 * would build it from the rows the action writes, and every date on the
 * screen is computed from `schedule` by the same functions the server uses.
 * `items` and `library` are then derived again from `schedule`, as
 * `getScheduleEditorData` derives them.
 */
import type { EditorItem, LibraryItem } from "@/lib/curriculum/schedule-editor-data";
import type { DatesPatch, ItemKey, ItemRowSnapshot, Placement } from "@/lib/curriculum/schedule-actions";
import {
  classItemTerm, classItemWeek, itemDates, type ClassRule, type ClassSchedule, type ScheduledCourse,
} from "@/lib/curriculum/tree";

export type Working = {
  schedule: ClassSchedule;
  items: EditorItem[];
  library: LibraryItem[];
  /** Every item the server listed, by key, so one taken off and put back
   *  keeps its hand-in counts. */
  known: Record<string, EditorItem>;
};

/** Who made a change and when, for "Changed by". */
type Stamp = { by: string | null; at: string };

export type Op =
  /** `setItemDates`: a field left out is left alone, null clears it. */
  | ({ t: "dates"; keys: ItemKey[]; patch: DatesPatch } & Stamp)
  /** `restoreItemDates`: rows put back exactly. */
  | ({ t: "rows"; rows: ItemRowSnapshot[] } & Stamp)
  /** `setClassRule`. */
  | { t: "rule"; rule: ClassRule | null }
  /** `placeItem`: any item, any week of any term. */
  | { t: "place"; item: ItemKey; termId: number; week: number }
  /** `restorePlacement`. */
  | ({ t: "unplace"; item: ItemKey; before: Placement } & Stamp)
  /** `removeAddedItem`. */
  | { t: "unadd"; item: ItemKey }
  | { t: "many"; ops: Op[] };

export const keyOf = (i: ItemKey) => `${i.courseId}|${i.ordinal}`;

export function working(d: { schedule: ClassSchedule; items: EditorItem[]; library: LibraryItem[] }): Working {
  return { ...d, known: Object.fromEntries(d.items.map((it) => [keyOf(it), it])) };
}

/** The working copy with one change made. */
export function apply(w: Working, op: Op | null): Working {
  if (!op) return w;
  return reconcile({ ...w, schedule: change(w.schedule, w.library, op) });
}

/* ── the schedule ── */

function change(s: ClassSchedule, library: LibraryItem[], op: Op): ClassSchedule {
  switch (op.t) {
    case "many":
      return op.ops.reduce((acc, o) => change(acc, library, o), s);
    case "rule":
      return { ...s, rule: op.rule };
    case "dates": {
      let out = s;
      for (const k of op.keys) {
        const cur = itemDates(out, k.ordinal, k.courseId);
        const p = op.patch;
        out = setRow(out, k, {
          opensAt: p.opensAt === undefined ? cur?.opensAt ?? null : p.opensAt,
          dueAt: p.dueAt === undefined ? cur?.dueAt ?? null : p.dueAt,
          held: p.held === undefined ? cur?.held ?? null : p.held,
        }, op);
      }
      return out;
    }
    case "rows":
      return op.rows.reduce((acc, r) => setRow(acc, r, r.row, op), s);
    case "place":
      return setRow(place(s, library, op.item, op.termId, op.week), op.item, null, { by: null, at: "" });
    case "unplace": {
      const { item, before } = op;
      const sc = s.courses.find((c) => c.courseId === item.courseId);
      let out = s;
      if (sc && !sc.added) {
        out = taken(s, sc, item, before.week === null ? null : {
          week: before.week, termId: before.termId ?? sc.termId,
        });
      } else if (before.week === null) {
        out = addedEntries(s, library, item.courseId, (es) => es.filter((e) => e.o !== item.ordinal));
      } else if (before.termId !== null) {
        const e = { o: item.ordinal, termId: before.termId, week: before.week };
        out = addedEntries(s, library, item.courseId, (es) => [...es.filter((x) => x.o !== item.ordinal), e]);
      }
      return setRow(out, item, before.dates, op);
    }
    case "unadd": {
      const out = addedEntries(s, library, op.item.courseId, (es) => es.filter((e) => e.o !== op.item.ordinal));
      return setRow(out, op.item, null, { by: null, at: "" });
    }
  }
}

/** An item's own dates row; one with nothing in it is no row (`setItemDates` deletes it). */
function setRow(s: ClassSchedule, k: ItemKey, row: ItemRowSnapshot["row"], stamp: Stamp): ClassSchedule {
  const all = { ...(s.itemDates ?? {}) };
  const m = { ...(all[k.courseId] ?? {}) };
  if (!row || (row.opensAt === null && row.dueAt === null && row.held === null)) delete m[k.ordinal];
  else m[k.ordinal] = { opensAt: row.opensAt, dueAt: row.dueAt, held: row.held, setBy: stamp.by, setAt: stamp.at };
  if (Object.keys(m).length) all[k.courseId] = m; else delete all[k.courseId];
  return { ...s, itemDates: all };
}

/** One entry of a course→ordinal→number map set, or deleted with `undefined`. */
function setIn(map: Record<string, Record<number, number>> | undefined, c: string, o: number, v: number | undefined) {
  const all = { ...(map ?? {}) };
  const m = { ...(all[c] ?? {}) };
  if (v === undefined) delete m[o]; else m[o] = v;
  if (Object.keys(m).length) all[c] = m; else delete all[c];
  return all;
}

function place(s: ClassSchedule, library: LibraryItem[], item: ItemKey, termId: number, week: number): ClassSchedule {
  const sc = s.courses.find((c) => c.courseId === item.courseId);
  if (sc && !sc.added) return taken(s, sc, item, { termId, week });
  const e = { o: item.ordinal, termId, week };
  return addedEntries(s, library, item.courseId, (es) => [...es.filter((x) => x.o !== item.ordinal), e]);
}

/**
 * A course the class takes: its own `class_course_items` row. In its own week
 * of its own term it has none (`placeItem` deletes it); in another term the
 * row carries that term, which `scheduleFromRows` reads into `itemTerms`.
 */
function taken(s: ClassSchedule, sc: ScheduledCourse, item: ItemKey, to: { termId: number; week: number } | null): ClassSchedule {
  const home = !to || (to.termId === sc.termId && to.week === item.ordinal);
  return {
    ...s,
    itemWeeks: setIn(s.itemWeeks, item.courseId, item.ordinal, home ? undefined : to!.week),
    itemTerms: setIn(s.itemTerms, item.courseId, item.ordinal, home || to!.termId === sc.termId ? undefined : to!.termId),
  };
}

type Entry = { o: number; termId: number; week: number };

/**
 * A course the class does not take: its `class_added_items` rows, edited, then
 * folded as `scheduleFromRows` folds them. The course sits under the earliest
 * term of its rows, each row past it is in `itemTerms`, and with no rows left
 * the course leaves the schedule.
 */
function addedEntries(s: ClassSchedule, library: LibraryItem[], courseId: string, edit: (es: Entry[]) => Entry[]): ClassSchedule {
  const idx = s.courses.findIndex((c) => c.courseId === courseId);
  const sc = idx >= 0 ? s.courses[idx] : null;
  if (sc && !sc.added) return s;
  const was: Entry[] = (sc?.ordinals ?? []).map((o) => ({
    o, termId: classItemTerm(s, sc!.termId, o, courseId), week: classItemWeek(s, o, courseId),
  }));
  const es = edit(was);
  let itemWeeks = s.itemWeeks;
  for (const e of was) if (!es.some((x) => x.o === e.o)) itemWeeks = setIn(itemWeeks, courseId, e.o, undefined);
  for (const e of es) itemWeeks = setIn(itemWeeks, courseId, e.o, e.week);
  const itemTerms = { ...(s.itemTerms ?? {}) };
  delete itemTerms[courseId];
  if (!es.length) {
    return { ...s, itemWeeks, itemTerms, courses: s.courses.filter((c) => c.courseId !== courseId) };
  }
  const termId = Math.min(...es.map((e) => e.termId));
  const later = Object.fromEntries(es.filter((e) => e.termId !== termId).map((e) => [e.o, e.termId]));
  if (Object.keys(later).length) itemTerms[courseId] = later;
  const ordinals = es.map((e) => e.o).sort((a, b) => a - b);
  let courses: ScheduledCourse[];
  if (sc) {
    courses = s.courses.map((c, i) => (i === idx ? { ...c, termId, ordinals } : c));
  } else {
    const lib = library.find((x) => x.courseId === courseId);
    if (!lib) return s;
    courses = [...s.courses, {
      courseId, key: lib.courseKey, label: lib.courseLabel, termId,
      position: 90 + s.courses.filter((c) => c.added).length, added: true, ordinals,
    }];
  }
  return { ...s, itemWeeks, itemTerms, courses };
}

/* ── what the screen lists, from the schedule ── */

/** `getScheduleEditorData`'s two lists, worked out again from `schedule`. */
function reconcile(w: Working): Working {
  const s = w.schedule;
  const byId = new Map(s.courses.map((c) => [c.courseId, c]));
  /** The course entry when the item is on the schedule, "removed" when it was taken out of its week. */
  const where = (c: string, o: number): ScheduledCourse | "removed" | null => {
    const sc = byId.get(c);
    if (!sc || (sc.ordinals && !sc.ordinals.includes(o))) return null;
    return itemDates(s, o, c)?.held === true ? "removed" : sc;
  };
  const library = w.library.map((x) => {
    const at = where(x.courseId, x.ordinal);
    const placed = at && at !== "removed"
      ? { termId: classItemTerm(s, at.termId, x.ordinal, x.courseId), week: classItemWeek(s, x.ordinal, x.courseId) }
      : null;
    const removed = at === "removed";
    const same = removed === x.removed && (placed === null ? x.placed === null
      : x.placed !== null && x.placed.termId === placed.termId && x.placed.week === placed.week);
    return same ? x : { ...x, placed, removed };
  });
  const listed = (k: ItemKey) => { const at = where(k.courseId, k.ordinal); return !!at && at !== "removed"; };
  const items: EditorItem[] = [];
  const seen = new Set<string>();
  const take = (it: EditorItem) => { const k = keyOf(it); if (seen.has(k)) return; seen.add(k); if (listed(it)) items.push(it); };
  for (const it of w.items) take(it);
  for (const it of Object.values(w.known)) take(it);
  for (const x of library) if (!seen.has(keyOf(x)) && x.placed) take(fromLibrary(x));
  // the server lists them by ordinal; a stable sort keeps the rest in its order
  items.sort((a, b) => a.ordinal - b.ordinal);
  return { ...w, library, items };
}

/** A library item as a schedule row; it has no hand-ins yet that the screen knows of. */
export function fromLibrary(x: LibraryItem): EditorItem {
  return {
    courseId: x.courseId, ordinal: x.ordinal, title: x.title, lessonId: x.lessonId, hasVideo: x.hasVideo,
    homework: x.hwId && x.hwNumber !== null ? { id: x.hwId, number: x.hwNumber } : null,
    handedIn: 0, marked: 0, late: 0,
  };
}
