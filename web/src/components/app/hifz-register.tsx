"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/app/filter-select";
import { setStudentHifzProfile, setTargetForStudents } from "@/lib/hifz/actions";
import { countTo, targetPresets } from "@/lib/hifz/targets";
import type { PaceStatus, Surah } from "@/lib/hifz/pace";
import { cn } from "@/lib/utils";

export type RegisterRow = {
  studentId: string;
  name: string;
  /** English name of the next surah due, if a target exists. */
  nextName: string | null;
  passed: number;
  target: number;
  expected: number;
  /** null = no hifz profile yet. */
  pace: PaceStatus | null;
  /** 114 until a teacher says otherwise. */
  startSurah: number;
};

const PACE_LABEL: Record<PaceStatus, string> = { ok: "ahead", warn: "on pace", danger: "behind" };

/**
 * The register with targets built in. Goals are student-specific, so the
 * teacher picks WHO first — a checkbox per row, or select all — and one
 * panel applies an end surah to the selection, each student's count derived
 * from their own start. Selecting exactly one student is the returning-
 * student case, so only then does the starts-at picker appear.
 */
export function HifzRegister({ rows, surahs }: { rows: RegisterRow[]; surahs: Surah[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<ReadonlySet<string>>(new Set());
  const [end, setEnd] = useState<number | null>(null);
  const [startOverride, setStartOverride] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const single = sel.size === 1 ? rows.find((r) => sel.has(r.studentId)) : undefined;
  // The picker starts from what the student already has; changing it is an
  // explicit act that only means anything for one student at a time.
  const start = single ? (startOverride ?? single.startSurah) : 114;
  const presets = targetPresets(start, surahs);
  const startIdx = surahs.find((s) => s.number === start)?.order_index ?? 1;
  const endOptions = single ? surahs.filter((s) => s.order_index >= startIdx) : surahs;
  const count = end === null ? null : countTo(start, end, surahs);

  const touch = (next: ReadonlySet<string>) => {
    setSel(next);
    setStartOverride(null);
    setMessage(null);
  };
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    touch(next);
  };

  const apply = () =>
    startTransition(async () => {
      if (single && count !== null) {
        await setStudentHifzProfile(single.studentId, start, count);
        setMessage(`Saved — ${single.name}'s target is ${count} surah${count === 1 ? "" : "s"}.`);
      } else if (end !== null) {
        const res = await setTargetForStudents([...sel], end);
        setMessage(
          `Applied to ${res.applied} student${res.applied === 1 ? "" : "s"}.` +
            (res.skipped.length
              ? ` Skipped ${res.skipped.join(", ")} — already past that surah.`
              : ""),
        );
      }
      // Not touch(): that resets the message this apply just wrote.
      setSel(new Set());
      setStartOverride(null);
      setEnd(null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {sel.size ? `${sel.size} of ${rows.length} selected` : "Select students to set a target."}
        </span>
        <span className="flex gap-1.5">
          <Button size="sm" variant="outline" disabled={pending || rows.length === 0}
            onClick={() => touch(new Set(rows.map((r) => r.studentId)))}>
            Select all
          </Button>
          {sel.size > 0 && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => touch(new Set())}>
              Clear
            </Button>
          )}
        </span>
      </div>

      {sel.size > 0 && (
        <div className="glass rounded-2xl p-4">
          <h2 className="text-sm font-medium">
            {single ? `Target for ${single.name}` : `Target for ${sel.size} students`}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {single && (
              <FilterSelect
                label="Starts at"
                value={String(start)}
                options={surahs.map((s) => ({
                  value: String(s.number), label: `${s.name_en} (${s.number})`,
                }))}
                onChange={(v) => {
                  const next = Number(v);
                  setStartOverride(next);
                  setMessage(null);
                  if (end !== null && countTo(next, end, surahs) === null) setEnd(null);
                }}
              />
            )}
            <FilterSelect
              label="Up to"
              value={end === null ? "" : String(end)}
              options={[
                { value: "", label: "Choose a surah…" },
                ...endOptions.map((s) => ({
                  value: String(s.number), label: `${s.name_en} (${s.number})`,
                })),
              ]}
              onChange={(v) => { setEnd(v === "" ? null : Number(v)); setMessage(null); }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <Button
                key={p.hizb}
                size="sm"
                variant={end === p.endSurah ? "default" : "outline"}
                disabled={pending}
                onClick={() => { setEnd(p.endSurah); setMessage(null); }}
              >
                {/* A count only tells the truth for one known start. */}
                {single ? `${p.label} · ${p.count}` : p.label}
              </Button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button size="sm" disabled={pending || end === null || (single && count === null)}
              onClick={apply}>
              {pending ? "Saving…" : single ? "Save target" : `Apply to ${sel.size} students`}
            </Button>
            <span className="text-xs text-muted-foreground">
              {single && count !== null && `= ${count} surah${count === 1 ? "" : "s"}`}
              {!single && "each counted from their own starting surah"}
            </span>
          </div>
        </div>
      )}

      {message && (
        <p className="text-xs text-ok" aria-live="polite">{message}</p>
      )}

      <ul className="divide-y divide-line overflow-hidden glass rounded-2xl">
        {rows.map((r) => (
          <li key={r.studentId} className="flex items-center gap-3 pl-4">
            <input
              type="checkbox"
              className="size-4 shrink-0"
              checked={sel.has(r.studentId)}
              disabled={pending}
              onChange={() => toggle(r.studentId)}
              aria-label={`Select ${r.name}`}
            />
            <Link
              href={`/teacher/hifz/${r.studentId}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-4 py-3 pr-4 transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="text-sm font-medium">{r.name}</span>
                {r.nextName && (
                  <span className="ml-2 text-xs text-muted-foreground">next: {r.nextName}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {r.passed}/{r.target || "—"} · expected {r.expected}
                </span>
                <span className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium",
                  r.pace === null && "bg-muted text-muted-foreground",
                  r.pace === "ok" && "bg-ok/12 text-ok",
                  r.pace === "warn" && "bg-warn/12 text-warn",
                  r.pace === "danger" && "bg-danger/12 text-danger",
                )}>
                  {r.pace === null ? "no target" : PACE_LABEL[r.pace]}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
