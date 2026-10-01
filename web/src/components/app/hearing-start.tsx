"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterSelect } from "./filter-select";

export type PlannedRange = { from: number; to: number };

/**
 * The start of a hearing: who (the page already names them, so only in the
 * title), where they start, and how far they plan to go. From is any surah
 * on the student's run; To runs from From down to the end of the run, so a
 * range can never point the wrong way. Changing From brings To back to it.
 * The plan is a starting point: End hearing widens it to cover any mark
 * beyond it, and the teacher can still move the end there.
 */
export function HearingStart({
  open, onOpenChange, studentName, run, defaultFrom, pending, error, onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  run: { number: number; name: string }[];   // memorisation order: down the mushaf
  defaultFrom: number;
  pending: boolean;
  /** Why the last Start failed, shown above the button until the next try. */
  error?: string | null;
  onStart: (range: PlannedRange) => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultFrom);
  // A fresh open starts from the defaults again, reset during render (not
  // an effect) so the popup never paints a stale choice first.
  const [tracked, setTracked] = useState({ open, defaultFrom });
  if (open !== tracked.open || defaultFrom !== tracked.defaultFrom) {
    setTracked({ open, defaultFrom });
    setFrom(defaultFrom);
    setTo(defaultFrom);
  }

  const ends = run.filter((s) => s.number <= from);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="space-y-3">
        <DialogHeader>
          <DialogTitle>Hearing {studentName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label="From"
            value={String(from)}
            onChange={(v) => {
              setFrom(Number(v));
              setTo(Number(v));
            }}
            options={run.map((s) => ({ value: String(s.number), label: s.name }))}
            disabled={pending}
          />
          <FilterSelect
            label="To"
            value={String(to)}
            onChange={(v) => setTo(Number(v))}
            options={ends.map((s) => ({ value: String(s.number), label: s.name }))}
            disabled={pending}
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button disabled={pending} onClick={() => onStart({ from, to })}>
          {pending ? "Starting…" : "Start"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
