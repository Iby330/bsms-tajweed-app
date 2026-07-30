"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { setExamScore } from "@/lib/exams/actions";

export function ExamInput({
  studentId, termId, max, initial,
}: { studentId: string; termId: number; max: number; initial: number | null }) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [pending, startTransition] = useTransition();
  return (
    <Input
      type="number" min={0} max={max} step="0.5"
      value={value} disabled={pending}
      placeholder={`/${max}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() =>
        startTransition(async () => {
          const n = value.trim() === "" ? null : Number(value);
          await setExamScore(studentId, termId, n);
        })
      }
      className="h-8 w-20 text-right tabular-nums"
    />
  );
}
