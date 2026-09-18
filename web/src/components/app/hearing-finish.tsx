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
  open, onOpenChange, from, initialEnd, minEnd, names, passedBefore, pending, onConfirm,
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
}) {
  const [end, setEnd] = useState(initialEnd);
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  // A fresh open starts from the computed end with everything ticked, and a
  // new `from`/`initialEnd` (the desk's start select, or a re-widened range)
  // must never be read against a stale `end` left over from before — that's
  // how an inverted range reached rangeSurahs and crashed the page. Reset
  // during render (not an effect) whenever any of the three tracked props
  // changes, so the popup never paints stale state first — the
  // React-recommended way to adjust state in response to a prop change
  // without a cascading effect.
  const [tracked, setTracked] = useState({ open, from, initialEnd });
  if (open !== tracked.open || from !== tracked.from || initialEnd !== tracked.initialEnd) {
    setTracked({ open, from, initialEnd });
    setEnd(initialEnd);
    setUnticked(new Set());
  }

  // Belt-and-braces: even if some future caller re-renders this component
  // with a stale `end` that the reset above didn't catch, clamp it into
  // [minEnd, from] before it ever reaches rangeSurahs — an inverted or
  // out-of-run value must never get that far.
  const safeEnd = Math.min(Math.max(end, minEnd), from);
  const surahs = rangeSurahs(from, safeEnd);
  const toggle = (s: number) =>
    setUnticked((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  const move = (delta: number) => {
    const next = end + delta;
    if (next > from || next < minEnd) return;
    // A surah leaving the range takes its tick with it; one arriving is
    // ticked. That means an untick is not remembered across a round trip:
    // "One fewer" pushes a surah out (dropping its entry from `unticked`
    // along with it), and "One more" brings it back in ticked, same as any
    // other surah newly in range — the earlier untick is gone, not restored.
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
          {count === 1 ? name(from) : `${name(from)} → ${name(safeEnd)} · ${count} surahs`}
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
          onClick={() => onConfirm({ to: safeEnd, passed: surahs.filter((s) => !unticked.has(s)), note })}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
