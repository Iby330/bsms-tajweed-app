"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorData, EditorItem } from "@/lib/curriculum/schedule-editor-data";
import type { DatesPatch } from "@/lib/curriculum/schedule-actions";
import type { ClassSchedule } from "@/lib/curriculum/tree";
import { DatePicker } from "./date-picker";
import { day, defaults, nextClassAt, status, when, type ItemState } from "./dates";
import { placeName } from "./add-panel";
import { keyOf } from "./optimistic";
import { DateCell, Sel, StatusPill, press, tap } from "./parts";

/** What every row needs from the screen. */
export type RowCtx = {
  data: EditorData;
  schedule: ClassSchedule;
  canEdit: boolean;
  nowIso: string;
  classDays: Set<string>;
  viewedTerm: number;
  weekLabel: (termId: number, n: number) => string;
  courseLabel: (courseId: string) => string;
  isAdded: (courseId: string) => boolean;
  markHref: (hwNumber: number) => string;
  /** A notice with nothing to save. */
  say: (msg: string) => void;
  check: (it: EditorItem, field: "opens" | "due") => (v: string) => string | null;
  patch: (keys: string[], p: DatesPatch, msg: string) => void;
  remove: (its: EditorItem[], msg: string) => void;
  move: (its: EditorItem[], termId: number, week: number) => void;
};

export type Open = "opens" | "due" | "more" | null;

export const GRID = "md:grid-cols-[28px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.9fr)_minmax(0,1fr)_72px]";

export function ScheduleRow({ it, s, ctx, showCourse, open, setOpen, selected, onToggle, saving, flashed }: {
  it: EditorItem; s: ItemState; ctx: RowCtx; showCourse: boolean;
  open: Open; setOpen: (o: Open) => void;
  selected: boolean; onToggle: () => void; saving: boolean; flashed: boolean;
}) {
  const { data, schedule, canEdit, nowIso } = ctx;
  const k = keyOf(it), st = status(s, !!it.homework, nowIso);
  const added = ctx.isAdded(it.courseId);
  const href = it.lessonId ? `/teacher/lessons/${it.lessonId}` : it.homework ? `/teacher/homework/${it.homework.number}` : null;
  const setter = s.own?.setBy ? data.names[s.own.setBy] : null;
  // met outside its course's own term: say where it came from
  const from = !added && s.termId !== s.courseTermId ? ` · from Term ${s.courseTermId}` : "";
  const toggle = (o: Open) => setOpen(open === o ? null : o);

  return (
    <div className={cn("relative bg-card", selected && "bg-[color-mix(in_oklab,var(--brand)_15%,var(--card))]", s.held && !selected && "bg-warn/5")}>
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 bg-brand/15 transition-opacity ease-out motion-reduce:transition-none",
        flashed ? "opacity-100 duration-150" : "opacity-0 duration-700")} />
      <div className={cn("relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5 px-[var(--pad)] py-3 text-sm tabular-nums md:gap-3", GRID)}>
        <span className="row-span-5 md:row-span-1">
          {canEdit && (
            <label className="-m-2 flex p-2 max-md:-m-3 max-md:p-3">
              <input type="checkbox" className="size-4 accent-[var(--ink)]" checked={selected} onChange={onToggle} aria-label={`Select ${it.title}`} />
            </label>
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {href ? <Link href={href} className="font-medium underline decoration-ink-3 decoration-dotted underline-offset-4 hover:text-brand">{it.title}</Link> : <span className="font-medium">{it.title}</span>}
          <span className="text-xs text-muted-foreground">
            {showCourse || added ? `${ctx.courseLabel(it.courseId)} ${it.ordinal} · ` : ""}Week {s.week} · {it.hasVideo ? "video + " : ""}{it.homework ? `homework ${it.homework.number}` : "video only"}{added ? " · added" : ""}{from}
          </span>
          {setter && s.own?.setAt && <span className="text-[11.5px] text-muted-foreground">Changed by {setter}, {day(s.own.setAt)}</span>}
          {saving && <span className="text-[11.5px] font-medium text-brand" aria-hidden>Saving…</span>}
        </span>
        <span className="col-start-2 flex flex-col items-start gap-1 max-md:flex-row max-md:flex-wrap max-md:items-baseline md:col-start-auto">
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-3 md:hidden">Opens</span>
          <DateCell text={s.held ? "Not until released" : when(s.opens)} src={s.held ? null : s.opensSrc} editable={canEdit} on={open === "opens"}
            label={`When ${it.title} opens`} onClick={() => toggle("opens")} />
        </span>
        <span className="col-start-2 flex flex-col items-start gap-1 max-md:flex-row max-md:flex-wrap max-md:items-baseline md:col-start-auto">
          <span className="font-mono text-[0.6rem] uppercase tracking-wider text-ink-3 md:hidden">Due</span>
          {it.homework ? <DateCell text={when(s.due)} src={s.dueSrc} editable={canEdit} on={open === "due"} label={`When ${it.title} is due`}
            onClick={() => toggle("due")} /> : <span className="text-xs text-muted-foreground">No homework</span>}
        </span>
        <span className="col-start-2 flex flex-col gap-0.5 max-md:flex-row max-md:flex-wrap max-md:gap-x-2 md:col-start-auto">
          {it.homework && <>
            <Link href={ctx.markHref(it.homework.number)} className="underline underline-offset-2">{it.handedIn} of {data.students} in</Link>
            <span className="text-xs text-muted-foreground">{it.marked} marked</span>
            {it.late > 0 && <span className="text-xs font-medium text-danger">{it.late} late</span>}
          </>}
        </span>
        <span className="col-start-2 md:col-start-auto"><StatusPill tone={st.tone}>{st.text}</StatusPill></span>
        <span className="col-start-3 row-start-1 justify-self-end md:col-start-auto md:row-start-auto">
          {canEdit && <Button size="sm" variant="ghost" className={cn(tap, press)} aria-expanded={open === "more"} aria-label={`${open === "more" ? "Close" : "More"} for ${it.title}`}
            onClick={() => toggle("more")}>{open === "more" ? "Close" : "More"}</Button>}
        </span>
      </div>

      {canEdit && (open === "opens" || open === "due") && (
        <div className="relative mx-[var(--pad)] border-t border-dashed border-hair py-4">
          <DatePicker
            key={`${k}-${open}`}
            heading={open === "due" ? `Deadline for ${it.title}` : `When ${it.title} opens`}
            verb={open === "due" ? "Due" : "Opens"}
            initial={(open === "due" ? s.due : s.opens) ?? defaults(schedule, it.courseId, it.ordinal).opens ?? nowIso}
            nowIso={nowIso}
            classDays={ctx.classDays}
            check={ctx.check(it, open)}
            saving={false}
            onCancel={() => setOpen(null)}
            onSave={(v) => {
              setOpen(null);
              ctx.patch([k], open === "due" ? { dueAt: v } : { opensAt: v, ...(s.held ? { held: false } : {}) },
                open === "due" ? `${it.title} is now due ${when(v)}.` : `${it.title} now opens ${when(v)}${s.held ? " and is released" : ""}.`);
            }}
            resetLabel={(open === "due" ? s.dueSrc : s.opensSrc) === "own" ? "Use default date" : null}
            onReset={() => { setOpen(null); ctx.patch([k], open === "due" ? { dueAt: null } : { opensAt: null }, `${it.title} is back on its default ${open === "due" ? "deadline" : "opening"}.`); }}
          />
        </div>
      )}

      {canEdit && open === "more" && (
        <div className="relative mx-[var(--pad)] flex flex-col gap-4 border-t border-dashed border-hair py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">Quick</span>
            <Button size="sm" variant="outline" className={cn(tap, press)} onClick={() => {
              setOpen(null);
              const stale = !!it.homework && !!s.due && s.due <= nowIso, nc = nextClassAt(schedule, data.section, nowIso);
              ctx.patch([k], { opensAt: nowIso, held: false, ...(stale ? { dueAt: nc } : {}) }, `${it.title} is open to students now${stale ? `, due ${when(nc)}` : ""}.`);
            }}>Open now</Button>
            {it.homework && (() => {
              const nc = nextClassAt(schedule, data.section, s.opens && s.opens > nowIso ? s.opens : nowIso);
              return <Button size="sm" variant="outline" className={cn(tap, press)} onClick={() => { setOpen(null); ctx.patch([k], { dueAt: nc }, `${it.title} is due ${when(nc)}.`); }}>Due at next class ({when(nc)})</Button>;
            })()}
            {s.held && <Button size="sm" variant="outline" className={cn(tap, press)} onClick={() => { setOpen(null); ctx.patch([k], { held: false }, `${it.title} is released.`); }}>Release</Button>}
            {(s.own?.opensAt || s.own?.dueAt) && <Button size="sm" variant="outline" className={cn(tap, press)} onClick={() => { setOpen(null); ctx.patch([k], { opensAt: null, dueAt: null }, `${it.title} is back on the default dates.`); }}>Use default dates</Button>}
            <Button size="sm" variant="destructive" className={cn("border-destructive/40", tap, press)} onClick={() => {
              setOpen(null);
              ctx.remove([it], `Removed ${it.title} from week ${s.week}. Put it in another week from "Add or move".`);
            }}>Remove from week {s.week}</Button>
          </div>
          <MovePicker idBase={`mv-${k}`} terms={data.terms} viewedTerm={ctx.viewedTerm} weekLabel={ctx.weekLabel}
            initial={{ termId: s.termId, week: s.week }} current={{ termId: s.termId, week: s.week }}
            ownDates={!!(s.own?.opensAt || s.own?.dueAt)}
            onMove={(t, w) => { setOpen(null); ctx.move([it], t, w); }} />
          <p className="text-xs text-muted-foreground">
            {s.held ? "Held: students can't see the video or the homework until you release it. " : ""}
            Remove takes it off the schedule and keeps it in &quot;Add or move&quot;. To change a date, click it in the row.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * "Move to another week": a term, a week and a button that says where. Used
 * by a row's More and by the bar for ticked items.
 */
export function MovePicker({ idBase, terms, viewedTerm, weekLabel, initial, current, count, ownDates, onMove }: {
  idBase: string;
  terms: EditorData["terms"];
  viewedTerm: number;
  weekLabel: (termId: number, n: number) => string;
  initial: { termId: number; week: number };
  /** Where the one item is now, for "Already in week 8". */
  current?: { termId: number; week: number };
  /** For several: how many would move to a term and week (those already there stay). */
  count?: (termId: number, week: number) => number;
  ownDates?: boolean;
  onMove: (termId: number, week: number) => void;
}) {
  const id = useId();
  const [termId, setTermId] = useState(initial.termId);
  const [week, setWeek] = useState(initial.week);
  const weeks = terms.find((t) => t.id === termId)?.weeks ?? [];
  const dest = placeName(termId, week, viewedTerm);
  const here = !!current && current.termId === termId && current.week === week;
  const n = count?.(termId, week);
  const none = n === 0;
  return (
    <div className="flex flex-col gap-2" role="group" aria-labelledby={`${id}-h`}>
      <b id={`${id}-h`} className="text-sm font-semibold">Move to another week</b>
      <div className="flex flex-wrap items-center gap-2">
        <Sel id={`${idBase}-t`} label="Term" value={termId} options={terms.map((t) => [t.id, `Term ${t.id}`] as [number, string])}
          onChange={(v) => { setTermId(v); const n = terms.find((t) => t.id === v)?.weeks.length ?? 1; if (week > n) setWeek(Math.max(n, 1)); }} />
        <Sel id={`${idBase}-w`} label="Week" value={week} className="max-w-full"
          options={weeks.map((w) => [w.number, weekLabel(termId, w.number)] as [number, string])} onChange={setWeek} />
        <Button size="sm" className={cn(tap, press)} disabled={here || none} onClick={() => onMove(termId, week)}>
          {here ? `Already in ${dest}` : none ? `All already in ${dest}` : n !== undefined ? `Move ${n} to ${dest}` : `Move to ${dest}`}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Moving puts {count !== undefined ? "them" : "it"} on that week&apos;s default dates{ownDates ? ", so its own dates go" : ""}.
      </p>
    </div>
  );
}
