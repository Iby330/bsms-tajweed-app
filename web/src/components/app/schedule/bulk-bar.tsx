"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorItem } from "@/lib/curriculum/schedule-editor-data";
import { DatePicker } from "./date-picker";
import { defaults, nextClassAt, when, type ItemState } from "./dates";
import { keyOf } from "./optimistic";
import { ReviewList, press, tap, type Review } from "./parts";
import { MovePicker, type RowCtx } from "./schedule-row";

type Mode = "opens" | "due" | "default" | "move" | null;

/**
 * The bar for ticked items. It sits in the content column, beside the sidebar
 * however wide the sidebar is (`--rail-w`, with the backdrop's own transition),
 * and on a phone above the tab bar (`--chrome-bottom`), as the hand-in bar does.
 */
export function BulkBar({ sel, states, ctx, viewed, onClear, onHeight }: {
  sel: EditorItem[];
  states: Map<string, ItemState>;
  ctx: RowCtx;
  viewed: { termId: number; week: number };
  onClear: () => void;
  onHeight: (px: number) => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [review, setReview] = useState<Review | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onHeight(el.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => { ro.disconnect(); onHeight(0); };
  }, [onHeight]);

  const { nowIso, schedule, data } = ctx;
  const st = (x: EditorItem) => states.get(keyOf(x))!;
  const done = () => { setMode(null); setReview(null); onClear(); };
  const flip = (m: Mode) => { setReview(null); setMode(mode === m ? null : m); };
  const reviewLines = (it: EditorItem) => {
    const s = st(it), d = defaults(schedule, it.courseId, it.ordinal), out: string[] = [];
    if (s.own?.opensAt) out.push(`Opens ${when(s.own.opensAt)} → default ${when(d.opens)}`);
    if (it.homework && s.own?.dueAt) out.push(`Due ${when(s.own.dueAt)} → default ${when(d.due)}`);
    return out;
  };
  const held = sel.filter((x) => st(x).held);
  const hw = sel.filter((x) => x.homework);
  const notAt = (t: number, w: number) => sel.filter((x) => { const s = st(x); return s.termId !== t || s.week !== w; });

  return (
    <div ref={ref}
      className="fixed right-0 bottom-[var(--chrome-bottom,0px)] left-[var(--rail-w,0px)] z-30 max-h-[calc(100dvh-var(--chrome-top,0px)-var(--chrome-bottom,0px)-1rem)] overflow-y-auto border-t border-line bg-card pt-2.5 pb-2.5 shadow-[0_-1px_1px_rgb(0_0_0/0.04),0_-10px_24px_-18px_rgb(0_0_0/0.4)] transition-[left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-lg:left-0 motion-reduce:transition-none lg:pb-[calc(10px+env(safe-area-inset-bottom,0px))]"
      role="region" aria-label={`${sel.length} selected`}
      onKeyDown={(e) => { if (e.key === "Escape" && mode) { e.preventDefault(); setMode(null); setReview(null); } }}>
      <div className="mx-auto flex max-w-[1000px] flex-wrap items-center gap-2 px-[var(--gutter)]">
        <span className="mr-1 text-sm font-semibold tabular-nums">{sel.length} selected</span>
        <Button size="sm" variant="outline" className={cn(tap, press)} aria-expanded={mode === "move"} onClick={() => flip("move")}>Move to week…</Button>
        <Button size="sm" variant="outline" className={cn(tap, press)} aria-expanded={mode === "opens"} onClick={() => flip("opens")}>Set release date</Button>
        <Button size="sm" variant="outline" className={cn(tap, press)} aria-expanded={mode === "due"} disabled={!hw.length} onClick={() => flip("due")}>Set due date</Button>
        {held.length > 0 && <Button size="sm" variant="outline" className={cn(tap, press)} onClick={() => {
          const ks = held.map(keyOf); done(); ctx.patch(ks, { held: false }, `${ks.length} released.`);
        }}>Release {held.length}</Button>}
        <Button size="sm" variant="outline" className={cn(tap, press)} aria-expanded={mode === "default"} onClick={() => {
          const custom = sel.filter((x) => { const o = st(x).own; return o && (o.opensAt || o.dueAt); });
          if (!custom.length) { setMode(null); setReview(null); ctx.say("These already use the default dates."); return; }
          setMode("default");
          setReview({ field: "both", heading: custom.length === 1 ? "1 of these has its own dates." : `${custom.length} of these have their own dates.`, items: custom.map((x) => ({ key: keyOf(x), title: x.title, lines: reviewLines(x) })), keep: new Set(custom.map(keyOf)) });
        }}>Use default dates</Button>
        <Button size="sm" variant="destructive" className={cn("border-destructive/40", tap, press)} onClick={() => {
          const its = sel; done(); ctx.remove(its, `${its.length} removed. They wait in "Add or move" for another week.`);
        }}>Remove</Button>
        <Button size="sm" variant="ghost" className={cn(tap, press)} onClick={done}>Clear selection</Button>

        {mode === "move" && (
          <div className="basis-full py-2">
            <MovePicker idBase="bulk-mv" terms={data.terms} viewedTerm={ctx.viewedTerm} weekLabel={ctx.weekLabel} initial={viewed}
              count={(t, w) => notAt(t, w).length}
              onMove={(t, w) => { const its = notAt(t, w); done(); ctx.move(its, t, w); }} />
          </div>
        )}
        {(mode === "opens" || mode === "due") && (
          <div className="basis-full py-2">
            <DatePicker
              key={mode}
              heading={mode === "opens" ? `Release date for ${sel.length} selected` : `Deadline for ${hw.length} selected`}
              verb={mode === "opens" ? "Opens" : "Due"}
              initial={mode === "opens" ? sel.map((x) => st(x).opens ?? nowIso).sort()[0] : nextClassAt(schedule, data.section, nowIso)}
              nowIso={nowIso} classDays={ctx.classDays} saving={false}
              check={(v) => {
                if (mode === "due") { const bad = sel.find((x) => x.homework && (st(x).opens ?? "") >= v); return bad ? `${bad.title} opens after that. Pick a later deadline.` : null; }
                const bad = sel.find((x) => x.homework && ctx.check(x, "opens")(v)); return bad ? `${bad.title} would open after its deadline. Pick an earlier date.` : null;
              }}
              onCancel={() => setMode(null)}
              onSave={(v) => {
                const ks = (mode === "due" ? hw : sel).map(keyOf);
                const heldN = mode === "opens" ? held.length : 0;
                const m = mode;
                done();
                ctx.patch(ks, m === "due" ? { dueAt: v } : { opensAt: v, held: false }, m === "due" ? `${ks.length} due ${when(v)}.` : `${ks.length} open ${when(v)}${heldN ? `; ${heldN} held ${heldN === 1 ? "was" : "were"} released` : ""}.`);
              }}
            />
          </div>
        )}
        {mode === "default" && review && (
          <div className="basis-full py-2">
            <ReviewList rv={review} onChange={setReview} bulk onCancel={() => { setMode(null); setReview(null); }} onDone={() => {
              const moving = review.items.filter((x) => !review.keep.has(x.key)).map((x) => x.key);
              done();
              if (!moving.length) { ctx.say("Your own dates are kept."); return; }
              ctx.patch(moving, { opensAt: null, dueAt: null }, `${moving.length} back on the default dates.`);
            }} />
          </div>
        )}
      </div>
    </div>
  );
}
