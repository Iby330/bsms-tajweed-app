"use client";

import { useState, useTransition } from "react";
import { reopenSubmission } from "@/lib/marking/actions";
import { Button } from "@/components/ui/button";

/**
 * "Reopen for the student": hands a submitted paper back as a draft, answers
 * kept. Two presses, the second on an inline confirm rather than a browser
 * dialog, because the first is easy to hit by accident and the student then
 * holds a paper the teacher meant to mark.
 */
export function ReopenSubmission({ submissionId, studentName }: { submissionId: string; studentName: string }) {
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
        Give this back to {studentName} as a draft? Their answers and recordings stay, and
        they hand it in again when they are ready. Nothing is marked until they do.
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
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
