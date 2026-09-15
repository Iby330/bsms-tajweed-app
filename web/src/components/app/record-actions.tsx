"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { setSurahComment, unmarkSurah } from "@/lib/hifz/actions";

/**
 * What survives of the old marking panel: the comment on a surah already
 * passed, and the way back. Passing itself now happens through a hearing.
 */
export function RecordActions({
  studentId, surah, comment,
}: {
  studentId: string;
  surah: number;
  comment: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(comment ?? "");
  const [pending, start] = useTransition();
  const dirty = text.trim() !== (comment ?? "").trim();
  const run = (work: () => Promise<void>) =>
    start(async () => {
      await work();
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="record-comment">Comment for the student</label>
      <Textarea
        id="record-comment"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. Tighten the madd in āyah 3 — the student reads this…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !dirty}
          onClick={() => run(() => setSurahComment(studentId, surah, text))}>
          {pending ? "Saving…" : "Save comment"}
        </Button>
        <Button size="sm" variant="outline" disabled={pending}
          onClick={() => run(() => unmarkSurah(studentId, surah))}>
          Undo pass
        </Button>
        <span className="text-xs text-muted-foreground">
          Undoing removes the pass; the hearings and their marks stay.
        </span>
      </div>
    </div>
  );
}
