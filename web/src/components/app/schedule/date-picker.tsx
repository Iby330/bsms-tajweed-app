"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { londonIso, londonParts, pad, rel, when } from "./dates";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * Pick a day and a time: a month with the class's teaching days marked, a
 * time box, and Now. The summary says in words what will be saved, and a
 * date that does not work is refused before Save.
 */
export function DatePicker({
  heading, verb, initial, nowIso, classDays, check, saving, onSave, onCancel, resetLabel, onReset,
}: {
  heading: string;
  verb: string;
  initial: string;
  nowIso: string;
  classDays: Set<string>;
  check: (iso: string) => string | null;
  saving: boolean;
  onSave: (iso: string) => void;
  onCancel: () => void;
  resetLabel?: string | null;
  onReset?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const p = londonParts(Date.parse(value));
  const [month, setMonth] = useState({ y: p.y, m: p.mo });
  const t = londonParts(Date.parse(nowIso));
  const today = `${t.y}-${pad(t.mo)}-${pad(t.d)}`, sel = `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  const lead = (new Date(Date.UTC(month.y, month.m - 1, 1, 12)).getUTCDay() + 6) % 7;
  const n = new Date(Date.UTC(month.y, month.m, 0, 12)).getUTCDate();
  const err = check(value);
  const go = (dm: number) => setMonth(({ y, m }) => { m += dm; return m < 1 ? { y: y - 1, m: 12 } : m > 12 ? { y: y + 1, m: 1 } : { y, m }; });

  return (
    <div
      className="flex max-w-[600px] flex-col gap-3"
      role="dialog"
      aria-label={heading}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        if (e.key === "Enter" && !(e.target as HTMLElement).closest("button") && !err) { e.preventDefault(); onSave(value); }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm font-semibold">{heading}</b>
        <Button size="icon-xs" variant="ghost" onClick={onCancel} aria-label="Close">×</Button>
      </div>
      <div className="grid gap-5 sm:grid-cols-[260px_1fr]">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <Button size="icon-xs" variant="ghost" onClick={() => go(-1)} aria-label="Previous month">‹</Button>
            <b className="font-semibold">{MONTHS[month.m - 1]} {month.y}</b>
            <Button size="icon-xs" variant="ghost" onClick={() => go(1)} aria-label="Next month">›</Button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
              <span key={d} aria-hidden className="pb-1 font-mono text-[0.58rem] uppercase tracking-wider text-ink-3">{d}</span>
            ))}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {Array.from({ length: n }, (_, i) => {
              const d = i + 1, id = `${month.y}-${pad(month.m)}-${pad(d)}`, isClass = classDays.has(id), on = id === sel;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${d} ${MONTHS[month.m - 1]}${isClass ? ", class day" : ""}${id === today ? ", today" : ""}`}
                  onClick={() => setValue(londonIso(month.y, month.m, d, p.h, p.mi))}
                  className={cn(
                    "relative aspect-square rounded-sm border border-transparent text-[13px] tabular-nums hover:border-ring",
                    id < today && "text-ink-3",
                    id === today && "border-hair font-semibold",
                    on && "border-ink bg-ink text-background",
                  )}
                >
                  {d}
                  {isClass && <span aria-hidden className={cn("absolute bottom-[3px] left-1/2 size-1 -translate-x-1/2 rounded-full", on ? "bg-background" : "bg-brand")} />}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden className="inline-block size-1 rounded-full bg-brand" /> class day</p>
        </div>
        <div className="flex flex-col items-start gap-2 text-sm">
          <Button size="sm" variant="outline" onClick={() => setValue(nowIso)}>Now</Button>
          <label htmlFor="schedule-time" className="font-medium">Time</label>
          <input
            id="schedule-time"
            type="time"
            value={`${pad(p.h)}:${pad(p.mi)}`}
            onChange={(e) => {
              const [h, mi] = e.target.value.split(":").map(Number);
              if (!Number.isNaN(h) && !Number.isNaN(mi)) setValue(londonIso(p.y, p.mo, p.d, h, mi));
            }}
            className="h-8 w-[130px] rounded-md border border-input bg-transparent px-2 tabular-nums"
          />
        </div>
      </div>
      <p className={cn("text-sm tabular-nums", err && "text-danger")}>
        {err ?? <>{verb} <b>{when(value)}</b> · {rel(value, nowIso)}</>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!!err || saving} onClick={() => onSave(value)}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button>
        {resetLabel && onReset && <Button size="sm" variant="ghost" disabled={saving} onClick={onReset}>{resetLabel}</Button>}
      </div>
    </div>
  );
}
