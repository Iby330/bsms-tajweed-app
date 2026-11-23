"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EditorData, LibraryItem } from "@/lib/curriculum/schedule-editor-data";
import { keyOf } from "./optimistic";
import { Chip, Seg, Sel, press, tap } from "./parts";

type Show = "off" | "all";

/** "week 8" in the term being viewed, "Term 1, week 8" in another. */
export const placeName = (termId: number, week: number, viewed: number) => (termId === viewed ? `week ${week}` : `Term ${termId}, week ${week}`);

/** Where an item is now, in words. */
export const whereNow = (x: LibraryItem) =>
  x.placed ? `Term ${x.placed.termId}, week ${x.placed.week}` : x.removed ? "Removed from its week" : "Not on the schedule";

/** "Ṣifāt 3 · video + homework 12". */
export const kindLine = (x: { courseLabel: string; ordinal: number; hasVideo: boolean; hwNumber: number | null }) =>
  `${x.courseLabel} ${x.ordinal} · ${x.hasVideo && x.hwNumber ? `video + homework ${x.hwNumber}` : x.hasVideo ? "video" : x.hwNumber ? `homework ${x.hwNumber}` : "no video yet"}`;

/**
 * The whole programme, to put anything in any week of any term: one not on
 * the schedule is added, one on it is moved. It stays open after each, so a
 * teacher can put several in, and a row just placed stays in the list
 * showing where it went.
 */
export function AddPanel({ library, terms, viewedTerm, initial, weekLabel, nowWeek, saving, onPlace, onClose }: {
  library: LibraryItem[];
  terms: EditorData["terms"];
  viewedTerm: number;
  initial: { termId: number; week: number };
  weekLabel: (termId: number, n: number) => string;
  nowWeek: (termId: number) => number | null;
  saving: Set<string>;
  onPlace: (x: LibraryItem, termId: number, week: number) => void;
  onClose: () => void;
}) {
  const [termId, setTermId] = useState(initial.termId);
  const [week, setWeek] = useState(initial.week);
  const [q, setQ] = useState("");
  const [course, setCourse] = useState("all");
  const [show, setShow] = useState<Show>("off");
  const [kept, setKept] = useState<Set<string>>(new Set());
  const search = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // focus moves into the panel; on a touch screen to the panel, not the search
  // box, so the keyboard does not cover the list
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) search.current?.focus();
    else box.current?.focus();
  }, []);

  const weeks = terms.find((t) => t.id === termId)?.weeks ?? [];
  const courses = [...new Map(library.map((x) => [x.courseId, x.courseLabel + (x.resource ? " (Resources)" : "")])).entries()];
  const needle = q.trim().toLowerCase();
  const shown = library.filter((x) => (course === "all" || x.courseId === course)
    && (show === "all" || !x.placed || kept.has(keyOf(x)))
    && (!needle || `${x.title} ${x.courseLabel} ${x.ordinal} ${x.hwNumber !== null ? `homework ${x.hwNumber} hw${x.hwNumber}` : ""}`.toLowerCase().includes(needle)));
  const now = nowWeek(termId);
  const dest = placeName(termId, week, viewedTerm);

  return (
    <div ref={box} tabIndex={-1} className="flex flex-col gap-3 bg-card px-[var(--pad)] py-4 outline-none" role="region" aria-label="Add or move videos and homework"
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
      <div className="flex items-center justify-between gap-2">
        <b className="text-sm font-semibold">Add or move videos and homework</b>
        <Button size="icon-sm" variant="ghost" className={cn("max-md:size-11", press)} aria-label="Close the list" onClick={onClose}>×</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="add-term" className="font-medium">Put in</label>
        <Sel id="add-term" label="Term" value={termId} options={terms.map((t) => [t.id, `Term ${t.id}`] as [number, string])}
          onChange={(v) => { setTermId(v); const n = terms.find((t) => t.id === v)?.weeks.length ?? 1; if (week > n) setWeek(Math.max(n, 1)); }} />
        <Sel id="add-week" label="Week" value={week} className="max-w-full"
          options={weeks.map((w) => [w.number, weekLabel(termId, w.number) + (w.number === now ? " (this week)" : "")] as [number, string])}
          onChange={setWeek} />
      </div>

      <div className="flex flex-col gap-2">
        <input ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, course or homework number"
          aria-label="Search videos and homework" className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm max-md:h-11" />
        <div className="flex flex-wrap items-center gap-2">
          <Seg label="Which items" value={show} options={[["off", "Not on the schedule"], ["all", "Everything"]]} onChange={setShow} />
          <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">{shown.length} shown</span>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Course">
          {[["all", "All courses"] as [string, string], ...courses].map(([id, l]) => (
            <Chip key={id} on={course === id} onClick={() => setCourse(id)}>{l}</Chip>
          ))}
        </div>
      </div>

      <ul className="max-h-[min(420px,60vh)] divide-y divide-line overflow-y-auto overscroll-contain border border-line">
        {shown.length ? shown.map((x) => {
          const k = keyOf(x), here = !!x.placed && x.placed.termId === termId && x.placed.week === week;
          const busy = saving.has(k);
          const label = here ? `Already in ${dest}` : x.placed ? `Move to ${dest}` : `Add to ${dest}`;
          return (
            <li key={k} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 pr-2 pl-3">
              <span className="flex min-w-0 flex-1 basis-[220px] flex-col text-sm">
                <span className="font-medium">{x.title}</span>
                <span className="text-xs text-muted-foreground">{kindLine(x)}</span>
                <span className={cn("text-xs font-medium", x.placed ? "text-foreground" : "text-muted-foreground")}>
                  {busy ? "Saving…" : whereNow(x)}
                </span>
              </span>
              <Button size="sm" variant={here ? "ghost" : "outline"} disabled={here} className={cn(tap, press, "max-md:w-full")}
                aria-label={`${label}: ${x.title}`}
                onClick={() => { setKept((s) => new Set(s).add(k)); onPlace(x, termId, week); }}>{label}</Button>
            </li>
          );
        }) : (
          <li className="p-3 text-sm text-muted-foreground">
            {needle ? `Nothing matches "${q.trim()}".` : show === "off" ? "Everything here is on the schedule. Pick Everything to move one." : "Nothing here."}
          </li>
        )}
      </ul>
    </div>
  );
}
