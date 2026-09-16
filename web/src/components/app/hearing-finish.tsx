"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rangeSurahs } from "@/lib/hifz/hearings";
import { fmtDay } from "@/lib/format";
import type { SurahNames } from "./mushaf-reader";

export type Verdict = { to: number; passed: number[]; note: string };

/**
 * The end of a hearing: the range as rows, a tick per surah, the note.
 * Confirm signs off the ticked surahs; an unticked one is heard and not
 * passed. A surah passed before says so on its row, because unticking it
 * revokes that pass. The end moves one surah at a time; a surah that
 * comes into the range arrives ticked, one that leaves takes its tick
 * with it.
 */
export function HearingFinish({
  open, onOpenChange, from, initialEnd, minEnd, names, passedBefore, pending, onConfirm, pages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  from: number;
  initialEnd: number;
  minEnd: number;                          // the last surah on the student's run
  names: SurahNames;
  passedBefore: Record<number, string>;   // surah → passed_at
  pending: boolean;
  onConfirm: (v: Verdict) => void;
  pages?: number;                          // pages the range spans, when known
}) {
  const [end, setEnd] = useState(initialEnd);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  // A fresh open starts from the computed end with everything ticked. Reset
  // during render (not an effect) when `open` flips true, so the popup never
  // paints the previous hearing's state first — the React-recommended way to
  // adjust state in response to a prop change without a cascading effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEnd(initialEnd);
      setUnticked(new Set());
    }
  }

  const surahs = rangeSurahs(from, end);
  const toggle = (s: number) =>
    setUnticked((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  const move = (delta: number) => {
    const next = end + delta;
    if (next > from || next < minEnd) return;
    // A surah leaving the range takes its tick with it; one arriving is ticked.
    setUnticked((cur) => new Set([...cur].filter((s) => s >= next && s <= from)));
    setEnd(next);
  };
  const name = (s: number) => names[s]?.en ?? String(s);
  const count = surahs.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm space-y-3">
        <DialogHeader>
          <DialogTitle>Finish hearing</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium">
          {count === 1
            ? name(from)
            : `${name(from)} → ${name(end)} · ${count} surahs${pages ? ` · ${pages} page${pages === 1 ? "" : "s"}` : ""}`}
        </p>

        <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Surahs heard">
          {surahs.map((s) => (
            <li key={s}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!unticked.has(s)} onChange={() => toggle(s)} />
                <span>{name(s)}</span>
                {passedBefore[s] && (
                  <span className="text-xs text-muted-foreground">passed {fmtDay(passedBefore[s])}</span>
                )}
              </label>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pending || end <= minEnd} onClick={() => move(-1)}>
            One more
          </Button>
          <Button size="sm" variant="outline" disabled={pending || end >= from} onClick={() => move(1)}>
            One fewer
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Ticked surahs are signed off. An unticked one stays heard and not passed, with its marks.
        </p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note for the student (optional)" rows={3} />
        <Button disabled={pending}
          onClick={() => onConfirm({ to: end, passed: surahs.filter((s) => !unticked.has(s)), note })}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
