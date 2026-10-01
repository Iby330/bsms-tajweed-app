"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { setExamScore } from "@/lib/exams/actions";

export function ExamInput({
  studentId, termId, max, initial,
}: { studentId: string; termId: number; max: number; initial: number | null }) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Input
      type="number" min={0} max={max} step="0.5"
      value={value} disabled={pending}
      placeholder={`/${max}`}
      // the box itself carries a failed save: red, with the reason on hover
      aria-invalid={error ? true : undefined}
      title={error ?? undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() =>
        startTransition(async () => {
          const n = value.trim() === "" ? null : Number(value);
          const { error } = await setExamScore(studentId, termId, n);
          setError(error);
        })
      }
      className="h-8 w-20 text-right tabular-nums"
    />
  );
}
