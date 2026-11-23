"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorData, EditorItem, LibraryItem } from "@/lib/curriculum/schedule-editor-data";
import {
  placeItem, removeAddedItem, restoreItemDates, restorePlacement, setClassRule, setItemDates,
  type DatesPatch, type ItemKey,
} from "@/lib/curriculum/schedule-actions";
import type { ClassSchedule } from "@/lib/curriculum/tree";
import { AddPanel } from "./add-panel";
import { BulkBar } from "./bulk-bar";
import { WEEKDAYS, classDay, day, defaults, itemState, londonToday, ruleShown, ruleToStore, status, when } from "./dates";
import { apply, keyOf, working, type Op } from "./optimistic";
import { Chip, ReviewList, Seg, Sel, TimeBox, band, press, tap, type Review } from "./parts";
import { GRID, ScheduleRow, type Open, type RowCtx } from "./schedule-row";

type Mode = "course" | "week" | "homework";
type HwFilter = "all" | "open" | "soon" | "held" | "closed";
type Res = { error: string | null; cleared?: number; clearedIds?: string[] };
/** What an Undo does: the change put back on the screen at once, and on the server. */
type Undo = { keys: string[]; op: Op | null; call: () => Promise<{ error: string | null }> };
type Toast = { id: number; msg: string; undo?: Undo; waiting?: boolean };

const fromKey = (k: string): ItemKey => { const [courseId, o] = k.split("|"); return { courseId, ordinal: +o }; };
const itemKey = (i: ItemKey): ItemKey => ({ courseId: i.courseId, ordinal: i.ordinal });
const WHICH = ["the first one after it opens", "a week after that", "two weeks after that"];
const LATER = ["", ", a week later", ", two weeks later"];
const OFFLINE = "That didn't save. Check your connection and try again.";
const NONE: string[] = [];

/** Several undos as one: put back in reverse order. */
function combine(undos: Undo[]): Undo | undefined {
  if (!undos.length) return undefined;
  if (undos.length === 1) return undos[0];
  const back = [...undos].reverse();
  return {
    keys: undos.flatMap((u) => u.keys),
    op: { t: "many", ops: back.flatMap((u) => (u.op ? [u.op] : [])) },
    call: async () => { for (const u of back) { const r = await u.call(); if (r.error) return r; } return { error: null }; },
  };
}

/**
 * A class's schedule: when each video and homework opens, when it is due, and
 * whether it is held, with the class default above it and an Undo after
 * every change. Everything not changed by hand follows the default dates.
 *
 * Every change shows at once: it is applied to a working copy of what the
 * server sent (`optimistic.ts`), then saved, one save at a time; when the
 * fresh page data lands it replaces the copy, and a save that fails falls away
 * with the error in the notice.
 */
export function ClassScheduleEditor({ data, canEdit, classParam }: { data: EditorData; canEdit: boolean; classParam: string | null }) {
  const { classId, section } = data;
  const nowIso = data.now;
  const base = useMemo(() => working(data), [data]);
  const [w, addOp] = useOptimistic(base, apply);
  const [savingList, markSaving] = useOptimistic<string[], string[]>(NONE, (s, ks) => [...s, ...ks]);
  const saving = useMemo(() => new Set(savingList), [savingList]);
  const [, start] = useTransition();
  const { schedule, items, library } = w;
  const states = useMemo(() => new Map(items.map((it) => [keyOf(it), itemState(schedule, it.courseId, it.ordinal, !!it.homework)])), [items, schedule]);
  const st = (it: ItemKey) => states.get(keyOf(it))!;
  const classDays = useMemo(() => new Set(data.classDays), [data.classDays]);
  const coursePos = useMemo(() => new Map(library.map((x) => [x.courseId, x.coursePosition])), [library]);
  const posOf = (id: string) => coursePos.get(id) ?? 1000 + (schedule.courses.find((c) => c.courseId === id)?.position ?? 0);
  const courseLabel = (id: string) => schedule.courses.find((c) => c.courseId === id)?.label ?? library.find((x) => x.courseId === id)?.courseLabel ?? "";
  const isAdded = (id: string) => !!schedule.courses.find((c) => c.courseId === id)?.added;

  /* ── weeks and terms ── */
  const today = londonToday(nowIso);
  const termOf = (id: number) => data.terms.find((t) => t.id === id);
  /** The week of the next class, in the term running now; null in any other term. */
  const nowWeek = (id: number): number | null => {
    if (id !== data.currentTerm) return null;
    return termOf(id)?.weeks.find((x) => x.classDate && x.classDate >= today)?.number ?? null;
  };
  const startWeek = (id: number) => nowWeek(id) ?? (id < data.currentTerm ? termOf(id)?.weeks.at(-1)?.number ?? 1 : 1);
  const weekLabel = (termId: number, n: number) => { const d = termOf(termId)?.weeks[n - 1]?.classDate; return d ? `Week ${n} · ${day(`${d}T12:00:00Z`)}` : `Week ${n}`; };

  const termsWith = data.terms.filter((t) => items.some((it) => st(it).termId === t.id));
  const [termId, setTermId] = useState(termsWith.some((t) => t.id === data.currentTerm) ? data.currentTerm : termsWith[0]?.id ?? data.currentTerm);
  const termTabs = data.terms.filter((t) => t.id === termId || termsWith.includes(t));
  const [mode, setMode] = useState<Mode>("week");
  const [course, setCourse] = useState<string | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const shownWeek = week ?? startWeek(termId);
  const [hwf, setHwf] = useState<HwFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpenState] = useState<{ key: string; what: Open } | null>(null);
  const [add, setAdd] = useState<{ termId: number; week: number } | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleReview, setRuleReview] = useState<Review | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const [barH, setBarH] = useState(0);
  const addBtn = useRef<HTMLButtonElement>(null);
  const busy = useRef(new Set<string>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(0);

  // a notice closes by itself five seconds after its save has answered
  useEffect(() => {
    if (!toast || toast.waiting) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const say = (msg: string) => setToast({ id: ++seq.current, msg });
  const late = (n?: number) => (n ? ` ${n} hand-in${n === 1 ? " is" : "s are"} no longer marked late.` : "");
  const stamp = () => ({ by: data.me, at: new Date().toISOString() });
  const flashKeys = (ks: string[]) => {
    if (!ks.length) return;
    setFlash((f) => new Set([...f, ...ks]));
    setTimeout(() => setFlash((f) => { const n = new Set(f); for (const k of ks) n.delete(k); return n; }), 2000);
  };

  /**
   * Make one change: on the screen at once, then on the server. Saves run one
   * after another, so two quick changes to one item never race; the same
   * control pressed twice while its save is out fires once.
   */
  const run = <R extends Res>(o: {
    id: string; keys: string[]; op: Op | null; msg: string; call: () => Promise<R>;
    undo?: (r: R) => Undo | undefined; fail?: (e: string) => string; onError?: () => void;
  }) => {
    if (busy.current.has(o.id)) return;
    busy.current.add(o.id);
    flashKeys(o.keys);
    const id = ++seq.current;
    setToast({ id, msg: o.msg, waiting: true });
    start(async () => {
      addOp(o.op);
      markSaving(o.keys);
      let r: R | { error: string };
      try {
        const p = queue.current.then(o.call, o.call);
        queue.current = p.catch(() => undefined);
        r = await p;
      } catch {
        r = { error: OFFLINE };
      } finally {
        busy.current.delete(o.id);
      }
      if (r.error) {
        o.onError?.();
        setToast({ id: ++seq.current, msg: o.fail ? o.fail(r.error) : r.error });
        return;
      }
      const ok = r as R;
      setToast((t) => (t?.id === id ? { id, msg: o.msg + late(ok.cleared), undo: o.undo?.(ok) } : t));
    });
  };
  const undo = (u: Undo) => {
    setToast(null);
    run({ id: `undo:${u.keys.join(",")}`, keys: u.keys, op: u.op, msg: "Undone.", call: u.call, fail: (e) => `Couldn't undo: ${e}` });
  };

  const patch = (ks: string[], p: DatesPatch, msg: string) => {
    if (!ks.length) { say(msg); return; }
    const its = ks.map(fromKey);
    run({
      id: `dates:${ks.join(",")}:${JSON.stringify(p)}`, keys: ks, msg,
      op: { t: "dates", keys: its, patch: p, ...stamp() },
      call: () => setItemDates(classId, its, p),
      undo: (r) => {
        const rows = r.undo;
        return rows ? { keys: ks, op: { t: "rows", rows, ...stamp() }, call: () => restoreItemDates(classId, rows, r.clearedIds ?? []) } : undefined;
      },
    });
  };

  /** Take items out of their weeks: an added one off the schedule, one of the
   *  class's own held for good, so it waits in "Add or move" for another week. */
  const remove = (its: EditorItem[], msg: string) => {
    const own = its.filter((it) => !isAdded(it.courseId)).map(itemKey);
    const added = its.filter((it) => isAdded(it.courseId)).map(itemKey);
    const ks = its.map(keyOf);
    const where = new Map(its.map((it) => [keyOf(it), { termId: st(it).termId, week: st(it).week }]));
    run<Res & { undos?: Undo[] }>({
      id: `remove:${ks.join(",")}`, keys: ks, msg,
      op: { t: "many", ops: [...(own.length ? [{ t: "dates", keys: own, patch: { held: true }, ...stamp() } as Op] : []), ...added.map((item) => ({ t: "unadd", item }) as Op)] },
      call: async () => {
        const undos: Undo[] = [];
        if (own.length) {
          const r = await setItemDates(classId, own, { held: true });
          if (r.error) return { error: r.error };
          const rows = r.undo ?? [];
          undos.push({ keys: own.map(keyOf), op: { t: "rows", rows, ...stamp() }, call: () => restoreItemDates(classId, rows, r.clearedIds ?? []) });
        }
        for (const item of added) {
          const r = await removeAddedItem(classId, item);
          if (r.error) return { error: r.error };
          const was = where.get(keyOf(item))!;
          const t = r.termId ?? was.termId, wk = r.week ?? was.week, rows = r.undo ?? [];
          undos.push({
            keys: [keyOf(item)],
            op: { t: "many", ops: [{ t: "place", item, termId: t, week: wk }, { t: "rows", rows, ...stamp() }] },
            call: async () => {
              const a = await placeItem(classId, item, t, wk);
              return a.error || !rows[0]?.row ? a : restoreItemDates(classId, rows);
            },
          });
        }
        return { error: null, undos };
      },
      undo: (r) => combine(r.undos ?? []),
    });
  };

  /** Put items in a week of a term: added when off the schedule, moved when on it. */
  const placeAll = (its: (ItemKey & { title: string })[], t: number, wk: number, msg: string) => {
    if (!its.length) return;
    const keys = its.map(itemKey), ks = keys.map(keyOf);
    run<Res & { undos?: Undo[] }>({
      id: `place:${ks.join(",")}:${t}:${wk}`, keys: ks, msg,
      op: { t: "many", ops: keys.map((item) => ({ t: "place", item, termId: t, week: wk }) as Op) },
      call: async () => {
        const undos: Undo[] = [];
        let cleared = 0;
        for (const item of keys) {
          const r = await placeItem(classId, item, t, wk);
          if (r.error) return { error: r.error };
          cleared += r.cleared ?? 0;
          const before = r.before;
          if (before) undos.push({ keys: [keyOf(item)], op: { t: "unplace", item, before, ...stamp() }, call: () => restorePlacement(classId, item, before, r.clearedIds ?? []) });
        }
        return { error: null, cleared, undos };
      },
      undo: (r) => combine(r.undos ?? []),
    });
  };
  const move = (its: EditorItem[], t: number, wk: number) =>
    placeAll(its, t, wk, its.length === 1 ? `Moved ${its[0].title} to Term ${t}, week ${wk}.` : `Moved ${its.length} to Term ${t}, week ${wk}.`);
  const placeFromLibrary = (x: LibraryItem, t: number, wk: number) =>
    placeAll([x], t, wk, `${x.placed ? "Moved" : "Added"} ${x.title} to Term ${t}, week ${wk}.`);

  /* ── the class default ── */
  const shown = ruleShown(schedule, section);
  const changeRule = (field: "opens" | "due", opening = shown.open, due = shown.due) => {
    const next = ruleToStore(section, opening, due);
    // items with their own date for the part that changed: keep, or move?
    const after: ClassSchedule = { ...schedule, rule: next };
    const custom = items.filter((it) => { const o = st(it).own; return o && (field === "opens" ? o.opensAt : it.homework && o.dueAt); });
    setRuleReview(custom.length ? {
      field,
      heading: custom.length === 1 ? `1 item has its own ${field === "opens" ? "opening" : "deadline"}.` : `${custom.length} items have their own ${field === "opens" ? "openings" : "deadlines"}.`,
      items: custom.map((it) => {
        const s = st(it), d = defaults(after, it.courseId, it.ordinal);
        return { key: keyOf(it), title: it.title, lines: [field === "opens" ? `Opens ${when(s.own!.opensAt)} → new default ${when(d.opens)}` : `Due ${when(s.own!.dueAt)} → new default ${when(d.due)}`] };
      }),
      keep: new Set(custom.map(keyOf)),
    } : null);
    run({
      id: `rule:${JSON.stringify(next)}`, keys: [], op: { t: "rule", rule: next },
      msg: field === "opens" ? `Things now open ${WEEKDAYS[opening.weekday]} ${opening.time}.` : `Homework is now due ${WEEKDAYS[due.weekday]} ${due.time}.`,
      call: () => setClassRule(classId, next),
      onError: () => setRuleReview(null),
      undo: (r) => ({ keys: [], op: { t: "rule", rule: r.before ?? null }, call: () => setClassRule(classId, r.before ?? null, r.clearedIds ?? []) }),
    });
  };
  const toCalendar = () => run({
    id: "rule:null", keys: [], op: { t: "rule", rule: null },
    msg: `${data.className} follows the weekly calendar again.`,
    call: () => setClassRule(classId, null),
    undo: (r) => ({ keys: [], op: { t: "rule", rule: r.before ?? null }, call: () => setClassRule(classId, r.before ?? null, r.clearedIds ?? []) }),
  });
  const finishRuleReview = (rv: Review) => {
    const moving = rv.items.filter((x) => !rv.keep.has(x.key)).map((x) => x.key);
    setRuleReview(null);
    if (!moving.length) { say("Your own dates are kept."); return; }
    patch(moving, rv.field === "opens" ? { opensAt: null } : { dueAt: null }, `${moving.length} moved to the default, ${rv.items.length - moving.length} kept.`);
  };

  const check = (it: EditorItem, field: "opens" | "due") => (v: string) => {
    const s = st(it);
    if (field === "due") return s.opens && v <= s.opens ? "That's before it opens. Pick a later deadline." : null;
    if (!it.homework) return null;
    const due = s.own?.dueAt ?? defaults({ ...schedule, itemDates: { ...schedule.itemDates, [it.courseId]: { ...schedule.itemDates?.[it.courseId], [it.ordinal]: { opensAt: v, dueAt: null, held: null } } } }, it.courseId, it.ordinal).due;
    return due && v >= due ? "That's after the deadline. Move the deadline first, or pick an earlier date." : null;
  };

  /* ── what is listed ── */
  const inTerm = items.filter((it) => st(it).termId === termId);
  const term = termOf(termId);
  const weekNums = [...new Set([...(term?.weeks.map((x) => x.number) ?? []), ...inTerm.map((it) => st(it).week)])].sort((a, b) => a - b);
  const perWeek = new Map<number, number>();
  for (const it of inTerm) perWeek.set(st(it).week, (perWeek.get(st(it).week) ?? 0) + 1);
  const termCourses = [...new Set(inTerm.map((it) => it.courseId))].sort((a, b) => posOf(a) - posOf(b));
  const courseId = termCourses.includes(course ?? "") ? course! : termCourses[0] ?? null;
  const byPlace = (a: EditorItem, b: EditorItem) => posOf(a.courseId) - posOf(b.courseId) || a.ordinal - b.ordinal;
  const listed = (() => {
    if (mode === "course") return inTerm.filter((it) => it.courseId === courseId).sort((a, b) => st(a).week - st(b).week || a.ordinal - b.ordinal);
    if (mode === "week") return inTerm.filter((it) => st(it).week === shownWeek).sort((a, b) => (st(a).opens ?? "").localeCompare(st(b).opens ?? "") || byPlace(a, b));
    return inTerm.filter((it) => it.homework).filter((it) => hwf === "all" || status(st(it), true, nowIso).tone === hwf)
      .sort((a, b) => (st(a).due ?? "").localeCompare(st(b).due ?? "") || byPlace(a, b));
  })();
  // only what is on screen: a ticked item moved out of view drops out of the bar
  const sel = listed.filter((it) => selected.has(keyOf(it)));
  const tones = listed.reduce((m, it) => { const t = status(st(it), !!it.homework, nowIso).tone; m[t] = (m[t] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

  const reset = () => { setSelected(new Set()); setOpenState(null); setAdd(null); };
  const toggle = (k: string) => setSelected((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; });
  const openAdd = (target: { termId: number; week: number }) => { setOpenState(null); setAdd(add ? null : target); };
  const closeAdd = () => { setAdd(null); requestAnimationFrame(() => addBtn.current?.focus()); };

  const ctx: RowCtx = {
    data, schedule, canEdit, nowIso, classDays, viewedTerm: termId, weekLabel, courseLabel, isAdded, check, patch, remove, move, say,
    markHref: (num) => `/teacher/homework/${num}${classParam ? `?class=${classParam}` : ""}`,
  };

  const plural = (d: number) => `${WEEKDAYS[d]}s`;
  const summary = `Opens ${plural(shown.open.weekday)} ${shown.open.time} · homework due ${plural(shown.due.weekday)} ${shown.due.time}${LATER[shown.due.weeksAfter] ?? ""}`;
  const barOpen = canEdit && sel.length > 0;
  const weekTitle = (() => { const d = term?.weeks[shownWeek - 1]?.classDate; return `Week ${shownWeek}${d ? ` · class ${classDay(d)}` : ""}`; })();

  return (
    <>
      <div className="divider"><span className="label">Schedule for {data.className}</span><span className="r" /><span className="m" /></div>

      {/* ── Default dates: one line, open to change ── */}
      <section className="mb-4 border border-line bg-card" aria-label="Default dates">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-[var(--pad)] py-2.5">
          <p className="min-w-0 text-sm">
            <b className="font-semibold">Default dates</b>
            <span className="text-muted-foreground"> · </span>{summary}
            <span className="text-muted-foreground">{schedule.rule ? " · changed for this class" : " · the weekly calendar"}</span>
          </p>
          <Button size="sm" variant="outline" className={cn(tap, press)} aria-expanded={ruleOpen || !!ruleReview} aria-controls="rule-box"
            onClick={() => { if (ruleOpen || ruleReview) { setRuleOpen(false); setRuleReview(null); } else setRuleOpen(true); }}>
            {ruleOpen || ruleReview ? "Done" : canEdit ? "Change" : "Details"}
          </Button>
        </div>
        {(ruleOpen || ruleReview) && (
          <div id="rule-box" className="flex flex-col gap-3 border-t border-line px-[var(--pad)] py-3.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Videos and homework open on</span>
              <Sel id="r-od" value={shown.open.weekday} disabled={!canEdit} options={WEEKDAYS} label="Opening day"
                onChange={(v) => changeRule("opens", { ...shown.open, weekday: v })} />
              <label htmlFor="r-ot">at</label>
              <TimeBox id="r-ot" label="Opening time" value={shown.open.time} disabled={!canEdit} onChange={(v) => changeRule("opens", { ...shown.open, time: v })} />
              <span className="text-muted-foreground">before each week&apos;s class</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Homework is due on</span>
              <Sel id="r-dd" value={shown.due.weekday} disabled={!canEdit} options={WEEKDAYS} label="Due day"
                onChange={(v) => changeRule("due", shown.open, { ...shown.due, weekday: v })} />
              <label htmlFor="r-dt">at</label>
              <TimeBox id="r-dt" label="Due time" value={shown.due.time} disabled={!canEdit} onChange={(v) => changeRule("due", shown.open, { ...shown.due, time: v })} />
              <Sel id="r-dw" value={shown.due.weeksAfter} disabled={!canEdit} options={WHICH} label="Which week"
                onChange={(v) => changeRule("due", shown.open, { ...shown.due, weeksAfter: v })} />
            </div>
            {ruleReview && <ReviewList rv={ruleReview} onChange={setRuleReview} onDone={() => finishRuleReview(ruleReview)} />}
            <p className="text-xs text-muted-foreground">
              {schedule.rule ? "Changed from the weekly calendar. Everything without its own date follows this." : "This is the weekly calendar. Change it and everything without its own date follows."}
              {canEdit && schedule.rule && <> <button type="button" className={cn("underline underline-offset-2", tap)} onClick={toCalendar}>Back to the weekly calendar</button></>}
              {!canEdit && " Only this class's teacher or the programme lead can change it."}
            </p>
          </div>
        )}
      </section>

      {/* ── View ── */}
      <div className="mb-3 flex flex-col items-start gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {termTabs.length > 1 && (
            <Seg label="Term" value={termId} options={termTabs.map((t) => [t.id, `Term ${t.id}`] as [number, string])}
              onChange={(v) => { setTermId(v); setWeek(null); reset(); }} />
          )}
          <Seg label="View" value={mode} options={[["week", "By week"], ["course", "By course"], ["homework", "All homework"]]}
            onChange={(v) => { setMode(v as Mode); setSelected(new Set()); setOpenState(null); }} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={mode === "week" ? "Week" : mode === "course" ? "Course" : "Homework"}>
          {mode === "course" && termCourses.map((c) => (
            <Chip key={c} on={c === courseId} onClick={() => { setCourse(c); setSelected(new Set()); setOpenState(null); }}>{courseLabel(c)}{isAdded(c) ? " (added)" : ""}</Chip>
          ))}
          {mode === "week" && weekNums.map((num) => {
            const count = perWeek.get(num) ?? 0, d = term?.weeks[num - 1]?.classDate, isNow = num === nowWeek(termId);
            return (
              <Chip key={num} on={num === shownWeek} empty={!count} className="flex min-w-[58px] flex-col items-center gap-0 px-2 py-1 leading-tight"
                label={`Week ${num}${d ? `, class ${classDay(d)}` : ""}, ${count ? n(count, "item") : "nothing in it"}${isNow ? ", this week" : ""}`}
                onClick={() => { setWeek(num); setSelected(new Set()); setOpenState(null); }}>
                <span className="tabular-nums">{num}{isNow && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-brand">now</span>}</span>
                <span className="text-[11px] font-normal text-muted-foreground tabular-nums">{d ? day(`${d}T12:00:00Z`) : "no class"}</span>
                {count > 0 && <span aria-hidden className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] px-1 text-[10px] font-semibold text-foreground tabular-nums">{count}</span>}
              </Chip>
            );
          })}
          {mode === "homework" && ([["all", "All"], ["open", "Open now"], ["soon", "Coming up"], ["held", "Held"], ["closed", "Deadline passed"]] as [HwFilter, string][]).map(([v, l]) => (
            <Chip key={v} on={hwf === v} onClick={() => { setHwf(v); setSelected(new Set()); }}>{l}</Chip>
          ))}
        </div>
      </div>

      {/* ── Schedule ── */}
      <section className="flex flex-col gap-px border border-line bg-line" aria-label="Schedule">
        <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-[var(--pad)] py-3", band)}>
          <div className="flex min-w-0 flex-col">
            <h2 className="text-[15px] font-bold [text-wrap:balance]">
              {mode === "week" ? weekTitle : mode === "course" ? `${courseId ? courseLabel(courseId) : "No courses"} in Term ${termId}` : `All homework in Term ${termId}`}
            </h2>
            <p className="text-xs font-medium text-foreground/80 tabular-nums">
              {listed.length ? [n(listed.length, "item"), tones.open && `${tones.open} open`, tones.soon && `${tones.soon} coming up`, tones.held && `${tones.held} held`, tones.closed && `${tones.closed} past the deadline`].filter(Boolean).join(" · ") : "Nothing here yet"}
            </p>
          </div>
          {canEdit && (
            <Button ref={addBtn} size="sm" className={cn(tap, press)} aria-expanded={!!add}
              onClick={() => openAdd({ termId, week: mode === "week" ? shownWeek : startWeek(termId) })}>
              {mode === "week" ? "+ Add to this week" : "+ Add or move"}
            </Button>
          )}
        </div>

        {canEdit && add && (
          <AddPanel key={`${add.termId}-${add.week}`} library={library} terms={data.terms} viewedTerm={termId} initial={add}
            weekLabel={weekLabel} nowWeek={nowWeek} saving={saving} onPlace={placeFromLibrary} onClose={closeAdd} />
        )}

        <div className={cn("hidden gap-3 bg-card px-[var(--pad)] py-2.5 font-mono text-[0.62rem] uppercase tracking-wider text-ink-3 md:grid", GRID)} aria-hidden>
          <span /><span>Item</span><span>Opens</span><span>Due</span><span>Hand-ins</span><span>Status</span><span />
        </div>
        {listed.length ? listed.map((it) => {
          const k = keyOf(it);
          return (
            <ScheduleRow key={k} it={it} s={st(it)} ctx={ctx} showCourse={mode !== "course"}
              open={open?.key === k ? open.what : null} setOpen={(what) => setOpenState(what ? { key: k, what } : null)}
              selected={selected.has(k)} onToggle={() => toggle(k)} saving={saving.has(k)} flashed={flash.has(k)} />
          );
        }) : (
          <div className="bg-card p-[var(--pad)] text-sm text-muted-foreground">
            {mode === "week" ? `Nothing in week ${shownWeek} yet.` : mode === "homework" ? "No homework matches this filter." : "Nothing in this course yet."}
            {canEdit && mode === "week" && " Use “+ Add to this week” to put a video or homework here."}
          </div>
        )}
      </section>
      <p className="mt-2.5 text-xs text-muted-foreground">Click a date to change it. Tick items to change or move several at once. Anything you haven&apos;t changed follows the default dates.</p>

      {/* ── Ticked items ── */}
      {barOpen && (
        <>
          <div aria-hidden style={{ height: barH }} />
          <BulkBar sel={sel} states={states} ctx={ctx} viewed={{ termId, week: mode === "week" ? shownWeek : startWeek(termId) }}
            onClear={() => setSelected(new Set())} onHeight={setBarH} />
        </>
      )}

      {/* ── The notice: centred on the content, above the bar when it shows ── */}
      <div role="status"
        className="pointer-events-none fixed right-0 left-[var(--rail-w,0px)] z-40 flex justify-center px-4 transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-lg:left-0 motion-reduce:transition-none"
        style={{ bottom: `calc(var(--chrome-bottom, 0px) + ${barOpen ? barH + 12 : 20}px)` }}>
        {toast && (
          <div className="pointer-events-auto flex max-w-[min(640px,100%)] items-center gap-3.5 rounded-md bg-foreground px-3.5 py-2.5 text-sm text-background shadow-[0_1px_1px_rgb(0_0_0/0.08),0_4px_8px_rgb(0_0_0/0.1),0_16px_32px_rgb(0_0_0/0.14)]">
            <span>{toast.msg}</span>
            {(toast.undo || toast.waiting) && (
              <button type="button" className={cn("shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50", tap)} disabled={!toast.undo}
                onClick={() => toast.undo && undo(toast.undo)}>{toast.waiting ? "Saving…" : "Undo"}</button>
            )}
            <button type="button" aria-label="Dismiss" className={cn("-ml-1 shrink-0 px-0.5 text-lg leading-none opacity-75 hover:opacity-100", tap)} onClick={() => setToast(null)}>×</button>
          </div>
        )}
      </div>
    </>
  );
}
