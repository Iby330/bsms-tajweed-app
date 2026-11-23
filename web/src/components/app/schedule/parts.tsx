"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ItemState } from "./dates";

/** A press you can feel: a slight shrink, not just a colour (none with reduced motion). */
export const press = "active:scale-[0.97] motion-reduce:active:scale-100";
/** 44px tall on a phone. */
export const tap = "max-md:min-h-11";
/** The middle strength of the brand: a band you can read as "this one" without a solid block. */
export const band = "bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground";

export type Review = { field: "opens" | "due" | "both"; heading: string; items: { key: string; title: string; lines: string[] }[]; keep: Set<string> };

/** A date in a row. Its own date (set by hand) is bold with one "changed" tag; a default one is plain. */
export function DateCell({ text, src, editable, on, label, onClick }: {
  text: string; src: ItemState["opensSrc"] | null; editable: boolean; on: boolean; label: string; onClick: () => void;
}) {
  const own = src === "own";
  const tag = own ? <span className="rounded-sm bg-brand/15 px-1.5 text-[11px] font-semibold text-brand">changed</span> : null;
  return (
    <>
      {editable ? (
        <button type="button" onClick={onClick} aria-expanded={on} aria-label={`${label}: ${text || "not set"}${own ? ", changed" : ""}. Change`}
          className={cn("-mx-1.5 -my-0.5 rounded-sm border border-dashed border-transparent px-1.5 py-0.5 text-left underline decoration-ink-3 decoration-dotted underline-offset-4 hover:border-ring hover:no-underline max-md:min-h-11",
            own && "font-semibold", on && "border-ring bg-brand/15 no-underline")}>
          {text}
        </button>
      ) : <span className={cn(own && "font-semibold")}>{text}</span>}
      {tag}
    </>
  );
}

export function StatusPill({ tone, children }: { tone: "held" | "soon" | "open" | "closed"; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[12.5px] font-semibold",
      tone === "open" && "bg-ok/15 text-ok", tone === "soon" && "bg-brand/15 text-brand",
      tone === "held" && "bg-warn/15 text-warn", tone === "closed" && "bg-muted text-muted-foreground")}>{children}</span>
  );
}

export function ReviewList({ rv, onChange, onDone, onCancel, bulk }: { rv: Review; onChange: (r: Review) => void; onDone: () => void; onCancel?: () => void; bulk?: boolean }) {
  const moving = rv.items.filter((x) => !rv.keep.has(x.key)).length;
  return (
    <div className="flex flex-col gap-2.5 border border-brand/40 bg-brand/15 px-3.5 py-3" role="group" aria-label="Items with their own dates">
      <p className="text-sm"><b>{rv.heading}</b> Ticked ones keep their own date. Untick any you want on the default dates.</p>
      <ul className="flex max-h-[240px] flex-col gap-2 overflow-y-auto">
        {rv.items.map((x) => (
          <li key={x.key}>
            <label className="flex cursor-pointer items-start gap-2 text-sm max-md:min-h-11">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--ink)]" checked={rv.keep.has(x.key)}
                onChange={(e) => { const keep = new Set(rv.keep); if (e.target.checked) keep.add(x.key); else keep.delete(x.key); onChange({ ...rv, keep }); }} />
              <span className="flex min-w-0 flex-col"><span className="font-medium">{x.title}</span>{x.lines.map((l) => <span key={l} className="text-xs text-muted-foreground">{l}</span>)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className={cn("underline underline-offset-2", tap)} onClick={() => onChange({ ...rv, keep: new Set(rv.items.map((x) => x.key)) })}>Keep all</button>
        <span className="text-muted-foreground">·</span>
        <button type="button" className={cn("underline underline-offset-2", tap)} onClick={() => onChange({ ...rv, keep: new Set() })}>Move all</button>
        <span className="flex-1" />
        <Button size="sm" className={cn(tap, press)} onClick={onDone}>{bulk ? (moving ? `Use default dates for ${moving}` : "Keep them all") : "Done"}</Button>
        {onCancel && <Button size="sm" variant="ghost" className={cn(tap, press)} onClick={onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

const field = "h-8 rounded-md border border-input bg-transparent px-2 text-sm max-md:h-11";

export function Sel({ id, value, options, label, disabled, onChange, className }: {
  id: string; value: number; options: [number, string][] | string[]; label: string; disabled?: boolean; onChange: (v: number) => void; className?: string;
}) {
  const opts: [number, string][] = typeof options[0] === "string" ? (options as string[]).map((o, i) => [i, o]) : (options as [number, string][]);
  return (
    <select id={id} aria-label={label} disabled={disabled} value={value} onChange={(e) => onChange(+e.target.value)} className={cn(field, "min-w-0", className)}>
      {opts.map(([v, o]) => <option key={v} value={v}>{o}</option>)}
    </select>
  );
}

export function TimeBox({ id, value, disabled, label, onChange }: { id: string; value: string; disabled: boolean; label: string; onChange: (v: string) => void }) {
  return (
    <input id={id} type="time" aria-label={label} disabled={disabled} defaultValue={value} key={value}
      onBlur={(e) => { if (e.target.value && e.target.value !== value) onChange(e.target.value); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={cn(field, "w-[120px] tabular-nums")} />
  );
}

/** A two- or three-way switch. */
export function Seg<T extends string | number>({ value, options, label, onChange }: { value: T; options: [T, string][]; label: string; onChange: (v: T) => void }) {
  return (
    <span className="inline-flex max-w-full overflow-hidden rounded-md border border-line" role="group" aria-label={label}>
      {options.map(([v, l], i) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}
          className={cn("min-h-9 px-3 text-sm transition-[scale,background-color] duration-150 ease-out max-md:min-h-11", press, i > 0 && "border-l border-line",
            v === value ? cn(band, "font-semibold") : "bg-card text-muted-foreground hover:bg-muted")}>{l}</button>
      ))}
    </span>
  );
}

export function Chip({ on, onClick, children, label, empty, className }: {
  on: boolean; onClick: () => void; children: React.ReactNode; label?: string; empty?: boolean; className?: string;
}) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} onClick={onClick}
      className={cn("relative min-h-8 rounded-md border px-3 py-1 text-sm transition-[scale,background-color] duration-150 ease-out max-md:min-h-11", press,
        on ? cn("border-brand/40 font-semibold", band) : empty ? "border-dashed border-line bg-transparent text-muted-foreground hover:bg-muted" : "border-line bg-card hover:bg-muted",
        className)}>{children}</button>
  );
}
