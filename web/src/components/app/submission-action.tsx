"use client";

import { useState, useTransition } from "react";
import { clearLate, liftRedoCap, reopenSubmission, undoRedo } from "@/lib/marking/actions";
import { Button } from "@/components/ui/button";

/**
 * A teacher's hand on one handed-in submission, marked or not: give it back
 * to the student as a draft with its answers kept. Two presses, the second
 * on an inline confirm rather than a browser dialog, because it takes the
 * paper out of the teacher's hands and the first press is easy to hit by
 * accident.
 */
export function SubmissionAction({
  submissionId,
  studentName,
}: {
  submissionId: string;
  studentName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Reopen for the student
      </Button>
    );
  }

  return (
    <div className="box c12 gap-3">
      <p className="text-sm">
        Give this back to {studentName} as a draft? Their answers and recordings stay, any
        marks are cleared, and they hand it in again when they are ready. It counts at its
        real mark once you mark it again.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await reopenSubmission(submissionId);
              if (result.error) setError(result.error);
            })
          }
        >
          {pending ? "Reopening…" : "Yes, reopen it"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Take back a redo the teacher sent by mistake, while the student has not
 * started it: the paper that was sent back returns to the teacher to mark,
 * as it was. Two presses with an inline confirm, as with reopening, because
 * it changes what the student sees and the first press is easy to hit.
 *
 * On success the action refreshes the page, which then has a marked script
 * to show in place of the redo, so this component simply goes away.
 */
export function UndoRedo({
  submissionId,
  studentName,
  capped,
}: {
  submissionId: string;
  studentName: string;
  /** Whether the redo counts as 60% at most, so the confirm only promises
   *  to take away a cap that is there. */
  capped: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        Undo the redo
      </Button>
    );
  }

  return (
    <div className="box c12 gap-3">
      <p className="text-sm">
        Take back the redo you sent {studentName}? The paper comes back to you to mark,
        with their answers, recordings and your marks as they were. Correct the mark and
        release it again.{capped && " The 60% cap on the redo goes too."} This only works
        while {studentName} hasn&apos;t started the redo.
      </p>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              // A throw (the network, a page older than the deploy) is put in
              // our words: production hides a server action's own message.
              const result = await undoRedo(submissionId).catch(() => ({
                error: "Could not undo the redo. Reload the page and try again.",
              }));
              if (result.error) setError(result.error);
            })
          }
        >
          {pending ? "Undoing…" : "Yes, undo the redo"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The "late" tag, with a way to take it off. One press, no confirm: there is
 *  no undo, but taking it off only ever helps the student. */
export function LateTag({ submissionId }: { submissionId: string }) {
  return (
    <RemovableTag
      label="late"
      tip="Not late: take the late mark off"
      ariaLabel="Remove the late mark"
      run={() => clearLate(submissionId)}
    />
  );
}

/** The "capped at 60%" tag on a redo, with a way to lift the cap: the fail
 *  that sent it back was a slip. One press, no confirm, as with the late tag:
 *  lifting it only ever helps the student. */
export function CapTag({ submissionId }: { submissionId: string }) {
  return (
    <RemovableTag
      label="capped at 60%"
      tip="Not a real fail: count this redo at its real mark"
      ariaLabel="Lift the 60% cap off this redo"
      run={() => liftRedoCap(submissionId)}
    />
  );
}

function RemovableTag({
  label,
  tip,
  ariaLabel,
  run,
}: {
  label: string;
  tip: string;
  ariaLabel: string;
  run: () => Promise<{ error: string | null }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-warn/12 px-1.5 py-0.5 text-xs text-warn">
      {label}
      <button
        type="button"
        disabled={pending}
        title={error ?? tip}
        aria-label={ariaLabel}
        onClick={() =>
          start(async () => {
            const result = await run();
            setError(result.error);
          })
        }
        className="rounded px-1 underline-offset-2 hover:underline disabled:opacity-50"
      >
        {pending ? "…" : error ? "failed, retry" : "remove"}
      </button>
    </span>
  );
}
