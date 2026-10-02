"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HearingFinish, type Verdict } from "./hearing-finish";
import { recordResults } from "@/lib/hifz/hearing-actions";
import type { SurahNames } from "./mushaf-reader";

/**
 * Pass / Not passed: the result step, apart from hearing. Opens the result
 * popup teachers know from End hearing (From and To, a tick per surah, the
 * note, Confirm) for one student, with no hearing in progress needed. From
 * starts at `from`, the student's next unpassed surah, and To starts equal
 * to it — unless `initialFrom`/`initialTo` preset a different range, as a
 * surah's own page does to pass that surah (and only that one) in two taps.
 * Confirm records the results and refreshes the page. Used on each register
 * row, the student's own page, and a surah's own page.
 */
export function ResultButton({
  studentId, studentName, run, from: defaultFrom, names, passedBefore,
  initialFrom, initialTo,
}: {
  studentId: string;
  studentName: string;
  /** The student's run, in memorisation order (down the mushaf). */
  run: number[];
  from: number;
  names: SurahNames;
  passedBefore: Record<number, string>;   // surah → passed_at
  /** Preset From/To for the popup's opening state. Both default to `from`
   *  (today's behaviour) when absent. */
  initialFrom?: number;
  initialTo?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [end, setEnd] = useState(initialTo ?? defaultFrom);
  const [pending, startTransition] = useTransition();
  const minEnd = run[run.length - 1];

  const confirm = (v: Verdict) =>
    startTransition(async () => {
      await recordResults(studentId, { from, to: v.to, passed: v.passed, note: v.note });
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        // Dark mode only: an outline button reads as nearly invisible against
        // the dark card, so it gets a filled look in the app's own accent
        // instead, with the foreground token that keeps it readable. Light
        // mode is untouched (plain outline).
        className="dark:border-transparent dark:bg-brand dark:text-primary-foreground dark:hover:bg-brand/90 dark:hover:text-primary-foreground"
        onClick={() => {
          const openFrom = initialFrom ?? defaultFrom;
          setFrom(openFrom);
          setEnd(initialTo ?? openFrom);
          setOpen(true);
        }}
      >
        Pass / Not passed
      </Button>
      <HearingFinish
        open={open}
        onOpenChange={setOpen}
        from={from}
        initialEnd={end}
        minEnd={minEnd}
        names={names}
        passedBefore={passedBefore}
        pending={pending}
        onConfirm={confirm}
        fromChoices={run}
        onFromChange={setFrom}
        title={`Pass / Not passed for ${studentName}`}
      />
    </>
  );
}
