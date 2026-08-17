"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueStrike, removeStrike, type StrikeReason } from "@/lib/strikes/actions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REASON_LABELS } from "@/components/app/strike-dots";
import { cn } from "@/lib/utils";

export type StudentStrike = {
  id: string;
  reason: string;
  note: string | null;
  issued_at: string;
};

const REASONS: { value: StrikeReason; label: string }[] = [
  { value: "homework", label: "Homework not done" },
  { value: "absence", label: "Absence" },
  { value: "conduct", label: "Conduct" },
];

/** `issued_at` is timestamptz, so it renders in the reader's own zone. */
function issuedOn(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? ""
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      }).format(new Date(ms));
}

/**
 * The strike record: what each strike was for, and the means to take it back
 * or add another.
 *
 * The list is on the page rather than behind the button. A record that has to
 * be opened to be read is not a record — the panel said "Manage strikes · 1 of
 * 3" and left the one thing worth knowing, what it was for, inside a dialog.
 * The dialog now does the one job a dialog is right for: composing a new
 * strike, where picking a reason and typing a note deserves the interruption.
 * Three in a term ends someone's place on the course, so it is never a one-tap
 * counter, and every strike can be removed again.
 */
export function StrikeManager({
  studentId,
  studentName,
  termId,
  strikes,
}: {
  studentId: string;
  studentName: string;
  termId: number;
  strikes: StudentStrike[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<StrikeReason>("homework");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const count = strikes.length;

  return (
    <div className="space-y-3">
      {count > 0 && (
        <ul className="divide-y divide-line">
          {strikes.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
              <span className="min-w-0">
                <span className="text-sm font-medium">
                  {REASON_LABELS[s.reason] ?? s.reason}
                </span>
                {/* A teacher's own words, set as prose — the mono meta style
                    the figures use turns a sentence into shouting. */}
                {s.note && (
                  <span className="mt-1 block text-sm leading-relaxed text-ink-2">{s.note}</span>
                )}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {issuedOn(s.issued_at)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    // Clear first: without this a failed removal left its
                    // message on screen through every later attempt.
                    setError(null);
                    const r = await removeStrike(s.id);
                    if (!r.ok) setError(r.error);
                    else router.refresh();
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              title={`Issue a strike for ${studentName}`}
            >
              {count === 0 ? "Issue a strike" : "Issue another strike"}
            </button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue a strike · {studentName}</DialogTitle>
            <DialogDescription>
              {count} of 3 this term. Three means leaving the course.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors",
                    reason === r.value ? "border-ink bg-ink text-primary-foreground" : "border-line hover:bg-muted",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened? (kept on the record)"
              className="h-8 text-xs"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button
              size="sm"
              className="w-full"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await issueStrike(studentId, termId, reason, note);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setNote("");
                  // Close on success rather than sitting open through the
                  // refresh. The strike is written by this point; the round
                  // trip that follows only repaints the page behind, and
                  // waiting on it made a saved strike feel like a stuck one.
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : "Issue strike"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
