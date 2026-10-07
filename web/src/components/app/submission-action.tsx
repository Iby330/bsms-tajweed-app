"use client";

import { useState, useTransition } from "react";
import { clearLate, reopenSubmission, sendBackForRedo } from "@/lib/marking/actions";
import { Button } from "@/components/ui/button";

const ACTIONS = {
  reopen: {
    run: reopenSubmission,
    label: "Reopen for the student",
    confirm: (name: string) =>
      `Give this back to ${name} as a draft? Their answers and recordings stay, and they hand it in again when they are ready. Nothing is marked until they do.`,
    yes: "Yes, reopen it",
    busy: "Reopening…",
  },
  redo: {
    run: sendBackForRedo,
    label: "Send back to redo",
    confirm: (name: string) =>
      `Send this back to ${name} to do again from a blank paper? This attempt and its marks stay here for you, and they will be told their teacher asked for it.`,
    yes: "Yes, send it back",
    busy: "Sending back…",
  },
} as const;

/**
 * A teacher's hand on one submission: reopen it, or send it back to redo.
 * Two presses, the second on an inline confirm rather than a browser dialog,
 * because either one takes the paper out of the teacher's hands and the
 * first press is easy to hit by accident.
 */
export function SubmissionAction({
  kind,
  submissionId,
  studentName,
}: {
  kind: keyof typeof ACTIONS;
  submissionId: string;
  studentName: string;
}) {
  const a = ACTIONS[kind];
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        {a.label}
      </Button>
    );
  }

  return (
    <div className="box c12 gap-3">
      <p className="text-sm">{a.confirm(studentName)}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await a.run(submissionId);
              if (result.error) setError(result.error);
            })
          }
        >
          {pending ? a.busy : a.yes}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The "late" tag, with a way to take it off. One press, no confirm: there is
 *  no undo, but taking it off only ever helps the student. */
export function LateTag({ submissionId }: { submissionId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-warn/12 px-1.5 py-0.5 text-xs text-warn">
      late
      <button
        type="button"
        disabled={pending}
        title={error ?? "Not late: take the late mark off"}
        aria-label="Remove the late mark"
        onClick={() =>
          start(async () => {
            const result = await clearLate(submissionId);
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
