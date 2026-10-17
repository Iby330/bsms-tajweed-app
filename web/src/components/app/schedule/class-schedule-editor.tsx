"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorData, EditorItem } from "@/lib/curriculum/schedule-editor-data";
import {
  addItem, removeAddedItem, restoreItemDates, setClassRule, setItemDates,
  type DatesPatch, type ItemKey, type ScheduleResult,
} from "@/lib/curriculum/schedule-actions";
import type { ClassSchedule } from "@/lib/curriculum/tree";
import { DatePicker } from "./date-picker";
import {
  WEEKDAYS, day, defaults, itemState, nextClassAt, ruleShown, ruleToStore, status, when,
  type ItemState,
} from "./dates";

type Mode = "course" | "week" | "homework";
type HwFilter = "all" | "open" | "soon" | "held" | "closed";
type Review = { field: "opens" | "due" | "both"; heading: string; items: { key: string; title: string; lines: string[] }[]; keep: Set<string> };
type Toast = { msg: string; undo?: () => Promise<unknown> };

const keyOf = (i: { courseId: string; ordinal: number }) => `${i.courseId}|${i.ordinal}`;
const fromKey = (k: string): ItemKey => { const [courseId, o] = k.split("|"); return { courseId, ordinal: +o }; };
const WHICH = ["the first one after it opens", "a week after that", "two weeks after that"];

/**
 * A class's schedule: when each video and homework opens, when it is due, and
 * whether it is held, with the class default above it and an Undo after
 * every change. Everything not changed by hand follows the default dates.
 */
export function ClassScheduleEditor({ data, canEdit, classParam }: { data: EditorData; canEdit: boolean; classParam: string | null }) {
  const { classId, schedule, items, section, nowIso } = { ...data, nowIso: data.now };
  const [pending, start] = useTransition();
  const termsWith = data.terms.filter((t) => schedule.courses.some((c) => c.termId === t.id));
  const [termId, setTermId] = useState(termsWith.some((t) => t.id === data.currentTerm) ? data.currentTerm : termsWith[0]?.id ?? data.currentTerm);
  const courses = schedule.courses.filter((c) => c.termId === termId).sort((a, b) => a.position - b.position);
  const [mode, setMode] = useState<Mode>("course");
  const [course, setCourse] = useState<string | null>(null);
  const courseId = courses.some((c) => c.courseId === course) ? course! : courses[0]?.courseId ?? null;
  const term = data.terms.find((t) => t.id === termId)!;
  const states = new Map(items.map((it) => [keyOf(it), itemState(schedule, it.courseId, it.ordinal, !!it.homework)]));
  let currentWeek = 1;
  for (const it of items) { const s = states.get(keyOf(it))!; if (s.termId === termId && s.opens && s.opens <= nowIso && !s.held) currentWeek = Math.max(currentWeek, s.week); }
  const [week, setWeek] = useState<number | null>(null);
  const shownWeek = week ?? currentWeek;
  const [hwf, setHwf] = useState<HwFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<string | null>(null);
  const [pick, setPick] = useState<{ key: string; field: "opens" | "due" } | null>(null);
  const [bulk, setBulk] = useState<"opens" | "due" | "default" | null>(null);
  const [bulkReview, setBulkReview] = useState<Review | null>(null);
  const [ruleReview, setRuleReview] = useState<Review | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const classDays = new Set(data.classDays);
  const courseLabel = (id: string) => schedule.courses.find((c) => c.courseId === id)?.label ?? "";

  // a notice closes by itself after five seconds
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const say = (t: Toast) => setToast(t);
  const late = (n?: number) => (n ? ` ${n} hand-in${n === 1 ? " is" : "s are"} no longer marked late.` : "");

  /** Run one change, then say what happened, with Undo where there is one. */
  const act = (fn: () => Promise<ScheduleResult>, msg: string, undo?: (r: ScheduleResult) => (() => Promise<unknown>) | undefined) =>
    start(async () => {
      const r = await fn();
      if (r.error) { say({ msg: r.error }); return; }
      say({ msg: msg + late(r.cleared), undo: undo?.(r) });
    });
  const restore = (r: ScheduleResult) => (r.undo ? () => restoreItemDates(classId, r.undo!) : undefined);
  const patch = (keys: string[], p: DatesPatch, msg: string) => act(() => setItemDates(classId, keys.map(fromKey), p), msg, restore);

  /* ── what is listed ── */
  const inTerm = items.filter((it) => states.get(keyOf(it))!.termId === termId);
  const listed = (() => {
    if (mode === "course") return inTerm.filter((it) => it.courseId === courseId);
    if (mode === "week") return inTerm.filter((it) => states.get(keyOf(it))!.week === shownWeek)
      .sort((a, b) => (states.get(keyOf(a))!.opens ?? "").localeCompare(states.get(keyOf(b))!.opens ?? ""));
    return inTerm.filter((it) => it.homework).filter((it) => hwf === "all" || status(states.get(keyOf(it))!, true, nowIso).tone === hwf)
      .sort((a, b) => (states.get(keyOf(a))!.due ?? "").localeCompare(states.get(keyOf(b))!.due ?? ""));
  })();
  const sel = [...selected].map((k) => items.find((it) => keyOf(it) === k)).filter((x): x is EditorItem => !!x);

  /* ── the class default ── */
  const shown = ruleShown(schedule, section);
  const changeRule = (field: "opens" | "due", open = shown.open, due = shown.due) => {
    const next = ruleToStore(section, open, due);
    start(async () => {
      const r = await setClassRule(classId, next);
      if (r.error) { say({ msg: r.error }); return; }
      const before = r.before ?? null;
      // items with their own date for the part that changed: keep, or move?
      const after: ClassSchedule = { ...schedule, rule: next };
      const custom = items.filter((it) => { const o = states.get(keyOf(it))!.own; return o && (field === "opens" ? o.opensAt : it.homework && o.dueAt); });
      if (custom.length) {
        setRuleReview({
          field,
          heading: custom.length === 1 ? `1 item has its own ${field === "opens" ? "opening" : "deadline"}.` : `${custom.length} items have their own ${field === "opens" ? "openings" : "deadlines"}.`,
          items: custom.map((it) => {
            const s = states.get(keyOf(it))!, d = defaults(after, it.courseId, it.ordinal);
            return { key: keyOf(it), title: it.title, lines: [field === "opens" ? `Opens ${when(s.own!.opensAt)} → new default ${when(d.opens)}` : `Due ${when(s.own!.dueAt)} → new default ${when(d.due)}`] };
          }),
          keep: new Set(custom.map(keyOf)),
        });
      }
      say({
        msg: (field === "opens" ? `Things now open ${WEEKDAYS[open.weekday]} ${open.time}.` : `Homework is now due ${WEEKDAYS[due.weekday]} ${due.time}.`) + late(r.cleared),
        undo: () => setClassRule(classId, before),
      });
    });
  };

  /* ── a review list: ticked keep their own dates ── */
  const reviewLines = (it: EditorItem) => {
    const s = states.get(keyOf(it))!, d = defaults(schedule, it.courseId, it.ordinal), out: string[] = [];
    if (s.own?.opensAt) out.push(`Opens ${when(s.own.opensAt)} → default ${when(d.opens)}`);
    if (it.homework && s.own?.dueAt) out.push(`Due ${when(s.own.dueAt)} → default ${when(d.due)}`);
    return out;
  };
  const finishReview = (rv: Review, which: "rule" | "bulk") => {
    const moving = rv.items.filter((x) => !rv.keep.has(x.key)).map((x) => x.key);
    if (which === "rule") setRuleReview(null); else { setBulkReview(null); setBulk(null); setSelected(new Set()); }
    if (!moving.length) { say({ msg: "Your own dates are kept." }); return; }
    const p: DatesPatch = rv.field === "opens" ? { opensAt: null } : rv.field === "due" ? { dueAt: null } : { opensAt: null, dueAt: null };
    patch(moving, p, which === "rule" ? `${moving.length} moved to the default, ${rv.items.length - moving.length} kept.` : `${moving.length} back on the default dates.`);
  };

  /* ── adding from another course ── */
  const [addOpen, setAddOpen] = useState(false);
  const [addWeek, setAddWeek] = useState<number | null>(null);
  const [addQ, setAddQ] = useState("");
  const [addCourse, setAddCourse] = useState("all");
  const libCourses = [...new Map(data.library.map((x) => [x.courseId, x.courseLabel])).entries()];
  const libShown = data.library.filter((x) => (addCourse === "all" || x.courseId === addCourse)
    && (!addQ.trim() || `${x.courseLabel} ${x.ordinal} ${x.title} ${x.hwNumber ?? ""}`.toLowerCase().includes(addQ.trim().toLowerCase())));
  const addTo = addWeek ?? (mode === "week" ? shownWeek : currentWeek);

  const linkFor = (it: EditorItem) => it.lessonId ? `/teacher/lessons/${it.lessonId}` : it.homework ? `/teacher/homework/${it.homework.number}` : null;
  const markHref = (n: number) => `/teacher/homework/${n}${classParam ? `?class=${classParam}` : ""}`;
  const weekLabel = (n: number) => { const d = term.weeks[n - 1]?.classDate; return d ? `Week ${n} · ${day(`${d}T12:00:00Z`)}` : `Week ${n}`; };
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const check = (it: EditorItem, field: "opens" | "due") => (v: string) => {
    const s = states.get(keyOf(it))!;
    if (field === "due") return s.opens && v <= s.opens ? "That's before it opens. Pick a later deadline." : null;
    if (!it.homework) return null;
    const due = s.own?.dueAt ?? defaults({ ...schedule, itemDates: { ...schedule.itemDates, [it.courseId]: { ...schedule.itemDates?.[it.courseId], [it.ordinal]: { opensAt: v, dueAt: null, held: null } } } }, it.courseId, it.ordinal).due;
    return due && v >= due ? "That's after the deadline. Move the deadline first, or pick an earlier date." : null;
  };

  return (
    <>
      {/* ── Default dates ── */}
      <div className="divider"><span className="label">Default dates</span><span className="r" /><span className="m" /></div>
      <section className="field"><div className="box c12 gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Videos and homework open on</span>
          <Sel id="r-od" value={shown.open.weekday} disabled={!canEdit || pending} options={WEEKDAYS} label="Opening day"
            onChange={(v) => changeRule("opens", { ...shown.open, weekday: v })} />
          <label htmlFor="r-ot">at</label>
          <TimeBox id="r-ot" value={shown.open.time} disabled={!canEdit || pending} onChange={(v) => changeRule("opens", { ...shown.open, time: v })} />
          <span className="text-muted-foreground">before each week&apos;s class</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Homework is due on</span>
          <Sel id="r-dd" value={shown.due.weekday} disabled={!canEdit || pending} options={WEEKDAYS} label="Due day"
            onChange={(v) => changeRule("due", shown.open, { ...shown.due, weekday: v })} />
          <label htmlFor="r-dt">at</label>
          <TimeBox id="r-dt" value={shown.due.time} disabled={!canEdit || pending} onChange={(v) => changeRule("due", shown.open, { ...shown.due, time: v })} />
          <Sel id="r-dw" value={shown.due.weeksAfter} disabled={!canEdit || pending} options={WHICH} label="Which week"
            onChange={(v) => changeRule("due", shown.open, { ...shown.due, weeksAfter: v })} />
        </div>
        {ruleReview && <ReviewList rv={ruleReview} onChange={setRuleReview} onDone={() => finishReview(ruleReview, "rule")} />}
        <p className="text-xs text-muted-foreground">
          {schedule.rule ? "Changed from the weekly calendar. Everything without its own date follows this." : "This is the weekly calendar. Change it and everything without its own date follows."}
          {canEdit && schedule.rule && (
            <> <button type="button" className="underline underline-offset-2" disabled={pending}
              onClick={() => { const before = schedule.rule ?? null; act(() => setClassRule(classId, null), `${data.className} follows the weekly calendar again.`, () => () => setClassRule(classId, before)); }}>Back to the weekly calendar</button></>
          )}
          {!canEdit && " Only this class's teacher or the programme lead can change it."}
        </p>
      </div></section>

      {/* ── Schedule ── */}
      <div className="divider"><span className="label">Schedule for {data.className}</span><span className="r" /><span className="m" /></div>
      <div className="mb-3 flex flex-col items-start gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {termsWith.length > 1 && (
            <Seg value={termId} options={termsWith.map((t) => [t.id, `Term ${t.id}`] as [number, string])}
              onChange={(v) => { setTermId(v); setWeek(null); setSelected(new Set()); setPick(null); setMore(null); }} />
          )}
          <Seg value={mode} options={[["course", "By course"], ["week", "By week"], ["homework", "All homework"]]}
            onChange={(v) => { setMode(v as Mode); setPick(null); setMore(null); }} />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
          {mode === "course" && courses.map((c) => (
            <Chip key={c.courseId} on={c.courseId === courseId} onClick={() => setCourse(c.courseId)}>{c.label}{c.added ? " (added)" : ""}</Chip>
          ))}
          {mode === "week" && term.weeks.map((w) => (
            <Chip key={w.number} on={w.number === shownWeek} onClick={() => setWeek(w.number)}>{weekLabel(w.number)}{w.number === currentWeek ? " · now" : ""}</Chip>
          ))}
          {mode === "homework" && ([["all", "All"], ["open", "Open now"], ["soon", "Coming up"], ["held", "Held"], ["closed", "Deadline passed"]] as [HwFilter, string][]).map(([v, l]) => (
            <Chip key={v} on={hwf === v} onClick={() => setHwf(v)}>{l}</Chip>
          ))}
        </div>
      </div>

      {canEdit && (addOpen ? (
        <section className="field mb-3"><div className="box c12 gap-3">
          <div className="flex items-center justify-between"><b className="text-sm font-semibold">Add a video or homework</b>
            <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={() => setAddOpen(false)}>×</Button></div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="add-week">Add to</label>
            <select id="add-week" className="h-8 rounded-md border border-input bg-transparent px-2" value={addTo} onChange={(e) => setAddWeek(+e.target.value)}>
              {term.weeks.map((w) => <option key={w.number} value={w.number}>{weekLabel(w.number)}{w.number === currentWeek ? " (this week)" : ""}</option>)}
            </select>
          </div>
          <input type="search" value={addQ} onChange={(e) => setAddQ(e.target.value)} placeholder="Search" aria-label="Search videos and homework"
            className="h-8 rounded-md border border-input bg-transparent px-2.5 text-sm" />
          <div className="flex flex-wrap gap-1">
            {[["all", "All"] as [string, string], ...libCourses].map(([id, l]) => <Chip key={id} on={addCourse === id} onClick={() => setAddCourse(id)}>{l}</Chip>)}
          </div>
          <ul className="max-h-[300px] divide-y divide-line overflow-y-auto overscroll-contain border border-line">
            {libShown.length ? libShown.map((x) => (
              <li key={`${x.courseId}|${x.ordinal}`} className="flex items-center justify-between gap-3 py-2 pr-2 pl-3 hover:bg-muted">
                <span className="flex min-w-0 flex-col text-sm"><span className="font-medium">{x.title}</span>
                  <span className="text-xs text-muted-foreground">{x.courseLabel} {x.ordinal} · {x.hasVideo && x.hwNumber ? `video + homework ${x.hwNumber}` : x.hasVideo ? "video" : `homework ${x.hwNumber}`}</span></span>
                <Button size="sm" variant="outline" disabled={pending} aria-label={`Add ${x.title}`}
                  onClick={() => act(() => addItem(classId, x, termId, addTo), `Added ${x.title} to week ${addTo}.`, () => () => removeAddedItem(classId, x))}>Add</Button>
              </li>
            )) : <li className="p-3 text-sm text-muted-foreground">Nothing matches{addQ ? ` "${addQ}"` : ""}.</li>}
          </ul>
        </div></section>
      ) : (
        <div className="mb-3"><Button size="sm" variant="outline" onClick={() => setAddOpen(true)} disabled={!data.library.length}>+ Add a video or homework</Button></div>
      ))}

      <section className="flex flex-col gap-px border border-line bg-line" aria-label="Schedule">
        <div className="hidden grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.9fr)_minmax(0,1fr)_60px] gap-3 bg-card px-[var(--pad)] py-2.5 font-mono text-[0.62rem] uppercase tracking-wider text-ink-3 md:grid" aria-hidden>
          <span /><span>Item</span><span>Opens</span><span>Due</span><span>Hand-ins</span><span>Status</span><span />
        </div>
        {listed.length ? listed.map((it) => {
          const k = keyOf(it), s = states.get(k)!, st = status(s, !!it.homework, nowIso), href = linkFor(it);
          const added = schedule.courses.find((c) => c.courseId === it.courseId)?.added;
          const setter = s.own?.setBy ? data.names[s.own.setBy] : null;
          return (
            <div key={k} className={cn("bg-card", selected.has(k) && "bg-brand/5", s.held && "bg-warn/5")}>
              <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 px-[var(--pad)] py-3 text-sm tabular-nums md:grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.9fr)_minmax(0,1fr)_60px] md:gap-3">
                <span className="row-span-5 pt-0.5 md:row-span-1">{canEdit && <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={selected.has(k)} onChange={() => toggle(k)} aria-label={`Select ${it.title}`} />}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  {href ? <Link href={href} className="font-medium underline decoration-ink-3 decoration-dotted underline-offset-4 hover:text-brand">{it.title}</Link> : <span className="font-medium">{it.title}</span>}
                  <span className="text-xs text-muted-foreground">{mode !== "course" || added ? `${courseLabel(it.courseId)} ${it.ordinal} · ` : ""}Week {s.week} · {it.hasVideo ? "video + " : ""}{it.homework ? `homework ${it.homework.number}` : "video only"}{added ? " · added" : ""}</span>
                  {setter && s.own?.setAt && <span className="text-[11.5px] text-muted-foreground">Changed by {setter}, {day(s.own.setAt)}</span>}
                </span>
                <span className="col-start-2 md:col-start-auto md:order-none flex flex-col items-start gap-1 max-md:flex-row max-md:flex-wrap max-md:items-baseline">
                  <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-3 md:hidden">Opens</span>
                  <DateCell text={s.held ? "Not until released" : when(s.opens)} src={s.held ? null : s.opensSrc} editable={canEdit} on={pick?.key === k && pick.field === "opens"}
                    onClick={() => { setMore(null); setPick(pick?.key === k && pick.field === "opens" ? null : { key: k, field: "opens" }); }} />
                </span>
                <span className="col-start-2 md:col-start-auto flex flex-col items-start gap-1 max-md:flex-row max-md:flex-wrap max-md:items-baseline">
                  <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-3 md:hidden">Due</span>
                  {it.homework ? <DateCell text={when(s.due)} src={s.dueSrc} editable={canEdit} on={pick?.key === k && pick.field === "due"}
                    onClick={() => { setMore(null); setPick(pick?.key === k && pick.field === "due" ? null : { key: k, field: "due" }); }} /> : <span className="text-xs text-muted-foreground">No homework</span>}
                </span>
                <span className="col-start-2 md:col-start-auto flex flex-col gap-0.5 max-md:flex-row max-md:flex-wrap max-md:gap-x-2">
                  {it.homework && <>
                    <Link href={markHref(it.homework.number)} className="underline underline-offset-2">{it.handedIn} of {data.students} in</Link>
                    <span className="text-xs text-muted-foreground">{it.marked} marked</span>
                    {it.late > 0 && <span className="text-xs font-medium text-danger">{it.late} late</span>}
                  </>}
                </span>
                <span className="col-start-2 md:col-start-auto"><StatusPill tone={st.tone}>{st.text}</StatusPill></span>
                <span className="col-start-3 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
                  {canEdit && <Button size="sm" variant="ghost" aria-expanded={more === k} onClick={() => { setPick(null); setMore(more === k ? null : k); }}>{more === k ? "Close" : "More"}</Button>}
                </span>
              </div>

              {pick?.key === k && (
                <div className="mx-[var(--pad)] border-t border-dashed border-hair py-4">
                  <DatePicker
                    key={`${k}-${pick.field}`}
                    heading={pick.field === "due" ? `Deadline for ${it.title}` : `When ${it.title} opens`}
                    verb={pick.field === "due" ? "Due" : "Opens"}
                    initial={(pick.field === "due" ? s.due : s.opens) ?? defaults(schedule, it.courseId, it.ordinal).opens ?? nowIso}
                    nowIso={nowIso}
                    classDays={classDays}
                    check={check(it, pick.field)}
                    saving={pending}
                    onCancel={() => setPick(null)}
                    onSave={(v) => { setPick(null); patch([k], pick.field === "due" ? { dueAt: v } : { opensAt: v, ...(s.held ? { held: false } : {}) },
                      pick.field === "due" ? `${it.title} is now due ${when(v)}.` : `${it.title} now opens ${when(v)}${s.held ? " and is released" : ""}.`); }}
                    resetLabel={(pick.field === "due" ? s.dueSrc : s.opensSrc) === "own" ? "Use default date" : null}
                    onReset={() => { setPick(null); patch([k], pick.field === "due" ? { dueAt: null } : { opensAt: null }, `${it.title} is back on its default ${pick.field === "due" ? "deadline" : "opening"}.`); }}
                  />
                </div>
              )}

              {more === k && (
                <div className="mx-[var(--pad)] flex flex-col gap-3 border-t border-dashed border-hair py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="label mr-1">Quick</span>
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => { setMore(null); patch([k], { opensAt: nowIso, held: false }, `${it.title} is open to students now.`); }}>Open now</Button>
                    {it.homework && (() => { const nc = nextClassAt(schedule, section, s.opens && s.opens > nowIso ? s.opens : nowIso); return (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => { setMore(null); patch([k], { dueAt: nc }, `${it.title} is due ${when(nc)}.`); }}>Due at next class ({when(nc)})</Button>); })()}
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => { setMore(null); patch([k], { held: !s.held }, s.held ? `${it.title} is released.` : `${it.title} is held. Students can't see it.`); }}>{s.held ? "Release" : "Hold"}</Button>
                    {(s.own?.opensAt || s.own?.dueAt) && <Button size="sm" variant="outline" disabled={pending} onClick={() => { setMore(null); patch([k], { opensAt: null, dueAt: null }, `${it.title} is back on the default dates.`); }}>Use default dates</Button>}
                    {added && <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => {
                      setMore(null);
                      start(async () => {
                        const r = await removeAddedItem(classId, it);
                        if (r.error) { say({ msg: r.error }); return; }
                        say({ msg: `Took ${it.title} off ${data.className}'s schedule.`, undo: async () => { await addItem(classId, it, r.termId ?? termId, r.week ?? s.week); if (r.undo?.[0]?.row) await restoreItemDates(classId, r.undo); } });
                      });
                    }}>Take it off the schedule</Button>}
                  </div>
                  <p className="text-xs text-muted-foreground">{s.held ? "Held: students can't see the video or the homework until you release it." : "Hold hides the video and the homework from students until you release it."} To change a date, click it in the row.</p>
                </div>
              )}
            </div>
          );
        }) : <div className="bg-card p-[var(--pad)] text-sm text-muted-foreground">{mode === "week" ? "Nothing in this week." : mode === "homework" ? "No homework matches this filter." : "Nothing in this course yet."}</div>}
      </section>
      <p className="mt-2.5 text-xs text-muted-foreground">Click a date to change it. Tick items to change several at once. Anything you haven&apos;t changed follows the default dates.</p>

      {/* ── Ticked items ── */}
      {canEdit && sel.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[80vh] overflow-y-auto border-t border-line bg-card px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] shadow-[0_-10px_24px_-18px_rgba(0,0,0,.4)]">
          <div className="mx-auto flex max-w-[1040px] flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold">{sel.length} selected</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { const ks = sel.map(keyOf); setSelected(new Set()); patch(ks, { held: true }, `${ks.length} held.`); }}>Hold</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => { const ks = sel.map(keyOf); setSelected(new Set()); patch(ks, { held: false }, `${ks.length} released.`); }}>Release</Button>
            <Button size="sm" variant="outline" aria-pressed={bulk === "opens"} onClick={() => setBulk(bulk === "opens" ? null : "opens")}>Set release date</Button>
            <Button size="sm" variant="outline" aria-pressed={bulk === "due"} disabled={!sel.some((x) => x.homework)} onClick={() => setBulk(bulk === "due" ? null : "due")}>Set due date</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => {
              const custom = sel.filter((x) => { const o = states.get(keyOf(x))!.own; return o && (o.opensAt || o.dueAt); });
              if (!custom.length) { say({ msg: "These already use the default dates." }); return; }
              setBulk("default");
              setBulkReview({ field: "both", heading: custom.length === 1 ? "1 of these has its own dates." : `${custom.length} of these have their own dates.`, items: custom.map((x) => ({ key: keyOf(x), title: x.title, lines: reviewLines(x) })), keep: new Set(custom.map(keyOf)) });
            }}>Use default dates</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set()); setBulk(null); setBulkReview(null); }}>Clear selection</Button>
            {(bulk === "opens" || bulk === "due") && (
              <div className="basis-full py-2">
                <DatePicker
                  key={bulk}
                  heading={bulk === "opens" ? `Release date for ${sel.length} selected` : `Deadline for ${sel.filter((x) => x.homework).length} selected`}
                  verb={bulk === "opens" ? "Opens" : "Due"}
                  initial={bulk === "opens" ? sel.map((x) => states.get(keyOf(x))!.opens ?? nowIso).sort()[0] : nextClassAt(schedule, section, nowIso)}
                  nowIso={nowIso} classDays={classDays} saving={pending}
                  check={(v) => {
                    if (bulk === "due") { const bad = sel.find((x) => x.homework && (states.get(keyOf(x))!.opens ?? "") >= v); return bad ? `${bad.title} opens after that. Pick a later deadline.` : null; }
                    const bad = sel.find((x) => x.homework && check(x, "opens")(v)); return bad ? `${bad.title} would open after its deadline. Pick an earlier date.` : null;
                  }}
                  onCancel={() => setBulk(null)}
                  onSave={(v) => {
                    const ks = (bulk === "due" ? sel.filter((x) => x.homework) : sel).map(keyOf);
                    const heldN = bulk === "opens" ? sel.filter((x) => states.get(keyOf(x))!.held).length : 0;
                    setBulk(null); setSelected(new Set());
                    patch(ks, bulk === "due" ? { dueAt: v } : { opensAt: v, held: false }, bulk === "due" ? `${ks.length} due ${when(v)}.` : `${ks.length} open ${when(v)}${heldN ? `; ${heldN} held ${heldN === 1 ? "was" : "were"} released` : ""}.`);
                  }}
                />
              </div>
            )}
            {bulk === "default" && bulkReview && (
              <div className="basis-full py-2"><ReviewList rv={bulkReview} onChange={setBulkReview} bulk onCancel={() => { setBulk(null); setBulkReview(null); }} onDone={() => finishReview(bulkReview, "bulk")} /></div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className={cn("fixed left-1/2 z-40 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3.5 rounded-md bg-foreground px-3.5 py-2.5 text-sm text-background shadow-lg", sel.length ? "bottom-[calc(76px+env(safe-area-inset-bottom,0px))]" : "bottom-[calc(20px+env(safe-area-inset-bottom,0px))]")}>
          <span>{toast.msg}</span>
          {toast.undo && <button type="button" className="underline underline-offset-2" onClick={() => { const u = toast.undo!; setToast(null); start(async () => { await u(); }); }}>Undo</button>}
          <button type="button" aria-label="Dismiss" className="-ml-1 px-0.5 text-lg leading-none opacity-75 hover:opacity-100" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </>
  );
}

/* ── small parts ── */

function DateCell({ text, src, editable, on, onClick }: { text: string; src: ItemState["opensSrc"] | null; editable: boolean; on: boolean; onClick: () => void }) {
  const tag = src === "own" ? <span className="rounded-sm bg-brand/15 px-1.5 font-mono text-[0.58rem] font-medium uppercase tracking-wider text-brand">set</span>
    : src === "class" ? <span className="rounded-sm bg-tertiary-surface px-1.5 font-mono text-[0.58rem] uppercase tracking-wider text-tertiary-foreground">class default</span>
    : src ? <span className="rounded-sm border border-hair px-1.5 font-mono text-[0.58rem] uppercase tracking-wider text-ink-3">calendar</span> : null;
  return (
    <>
      {editable ? (
        <button type="button" onClick={onClick} aria-expanded={on}
          className={cn("-mx-1.5 -my-0.5 rounded-sm border border-dashed border-transparent px-1.5 py-0.5 text-left underline decoration-ink-3 decoration-dotted underline-offset-4 hover:border-ring hover:no-underline", on && "border-ring bg-brand/10 no-underline")}>
          {text}
        </button>
      ) : <span>{text}</span>}
      {tag}
    </>
  );
}

function StatusPill({ tone, children }: { tone: "held" | "soon" | "open" | "closed"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[12.5px] font-semibold",
      tone === "open" && "bg-ok/15 text-ok", tone === "soon" && "bg-brand/15 text-brand",
      tone === "held" && "bg-warn/15 text-warn", tone === "closed" && "bg-muted text-muted-foreground")}>{children}</span>
  );
}

function ReviewList({ rv, onChange, onDone, onCancel, bulk }: { rv: Review; onChange: (r: Review) => void; onDone: () => void; onCancel?: () => void; bulk?: boolean }) {
  const moving = rv.items.filter((x) => !rv.keep.has(x.key)).length;
  return (
    <div className="flex flex-col gap-2.5 border border-brand/40 bg-brand/5 px-3.5 py-3" role="group" aria-label="Items with their own dates">
      <p className="text-sm"><b>{rv.heading}</b> Ticked ones keep their own date. Untick any you want on the default dates.</p>
      <ul className="flex max-h-[240px] flex-col gap-2 overflow-y-auto">
        {rv.items.map((x) => (
          <li key={x.key}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--ink)]" checked={rv.keep.has(x.key)}
                onChange={(e) => { const keep = new Set(rv.keep); if (e.target.checked) keep.add(x.key); else keep.delete(x.key); onChange({ ...rv, keep }); }} />
              <span className="flex min-w-0 flex-col"><span className="font-medium">{x.title}</span>{x.lines.map((l) => <span key={l} className="text-xs text-muted-foreground">{l}</span>)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="underline underline-offset-2" onClick={() => onChange({ ...rv, keep: new Set(rv.items.map((x) => x.key)) })}>Keep all</button>
        <span className="text-muted-foreground">·</span>
        <button type="button" className="underline underline-offset-2" onClick={() => onChange({ ...rv, keep: new Set() })}>Move all</button>
        <span className="flex-1" />
        <Button size="sm" onClick={onDone}>{bulk ? (moving ? `Use default dates for ${moving}` : "Keep them all") : "Done"}</Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

function Sel({ id, value, options, label, disabled, onChange }: { id: string; value: number; options: string[]; label: string; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <select id={id} aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(+e.target.value)}
      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm">
      {options.map((o, i) => <option key={o} value={i}>{o}</option>)}
    </select>
  );
}

function TimeBox({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <input id={id} type="time" disabled={disabled} defaultValue={value} key={value}
      onBlur={(e) => { if (e.target.value && e.target.value !== value) onChange(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-[120px] rounded-md border border-input bg-transparent px-2 text-sm tabular-nums" />
  );
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-ink" role="group">
      {options.map(([v, l], i) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={cn("px-3 py-1.5 text-sm", i > 0 && "border-l border-ink", v === value ? "bg-ink text-background" : "bg-card")}>{l}</button>
      ))}
    </span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("rounded-md border px-3 py-1 text-sm", on ? "border-ink bg-ink text-background" : "border-line bg-card hover:bg-muted")}>{children}</button>
  );
}
