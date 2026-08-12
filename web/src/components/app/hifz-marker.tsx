"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markSurahPassed, unmarkSurah } from "@/lib/hifz/actions";
import { cn } from "@/lib/utils";

export type SurahRow = {
  number: number;
  name_en: string;
  name_ar: string;
  passed: boolean;
  comment: string | null;
};

export function HifzMarker({
  studentId, rows,
}: { studentId: string; rows: SurahRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
      {rows.map((s) => (
        <li key={s.number} className="px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                s.passed ? "bg-ok/15 text-ok" : "border border-line text-muted-foreground",
              )}>{s.passed ? "✓" : ""}</span>
              <span className="truncate text-sm">
                {s.name_en}{" "}
                <span dir="rtl" lang="ar" className="ar-ui text-muted-foreground">{s.name_ar}</span>
              </span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              <Button size="sm" variant={s.passed ? "outline" : "default"} disabled={pending}
                onClick={() => {
                  if (s.passed) {
                    startTransition(async () => {
                      await unmarkSurah(studentId, s.number);
                      router.refresh();
                    });
                  } else {
                    setOpen(open === s.number ? null : s.number);
                    setComment(s.comment ?? "");
                  }
                }}>
                {s.passed ? "Undo" : "Pass"}
              </Button>
            </span>
          </div>

          {s.passed && s.comment && (
            <p className="ml-7 mt-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2">
              {s.comment}
            </p>
          )}

          {open === s.number && (
            <div className="ml-7 mt-2 flex gap-2">
              <Input autoFocus value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Feedback for the student (optional) — e.g. mistakes to fix"
                className="h-8 text-sm" />
              <Button size="sm" disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markSurahPassed(studentId, s.number, comment);
                    setOpen(null);
                    setComment("");
                    router.refresh();
                  })
                }>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
