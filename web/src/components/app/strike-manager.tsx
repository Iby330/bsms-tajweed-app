"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { issueStrike, removeStrike, type StrikeReason } from "@/lib/strikes/actions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * Issue or take back a strike. Three in a term ends someone's place on the
 * course, so this is deliberately a dialog with a note field rather than a
 * one-tap counter — and every strike can be removed again.
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "rounded-md px-2 py-0.5 tabular-nums transition-colors hover:bg-muted",
              count >= 3 ? "font-medium text-danger" : count > 0 ? "text-warn" : "text-muted-foreground",
            )}
            title={`Strikes for ${studentName}`}
          >
            {count}
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Strikes · {studentName}</DialogTitle>
          <DialogDescription>
            {count} of 3 this term. Three means leaving the course.
          </DialogDescription>
        </DialogHeader>

        {count > 0 && (
          <ul className="space-y-1.5">
            {strikes.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-3 rounded-md border border-line px-2.5 py-2"
              >
                <span className="min-w-0">
                  <span className="text-xs font-medium capitalize">{s.reason}</span>
                  {s.note && <span className="block text-xs text-muted-foreground">{s.note}</span>}
                  <span className="block text-[11px] text-muted-foreground">
                    {new Date(s.issued_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
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

        <div className="space-y-2 border-t border-line pt-3">
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
                router.refresh();
              })
            }
          >
            {pending ? "Saving…" : "Issue strike"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
