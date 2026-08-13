"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/app/filter-select";
import { setStudentHifzProfile } from "@/lib/hifz/actions";
import { countTo, targetPresets } from "@/lib/hifz/targets";
import type { Surah } from "@/lib/hifz/pace";
import { cn } from "@/lib/utils";

/**
 * One student's start + target — the returning-student entry point. The start
 * moves, so the hizb presets and every count re-derive from it; the pair is
 * saved together and marks the profile custom, exempting it from the class
 * default from then on.
 */
export function StudentTargetForm({
  studentId, surahs, current,
}: {
  studentId: string;
  /** The full run in memorisation order. */
  surahs: Surah[];
  current: { startSurah: number; targetCount: number; isCustom: boolean } | null;
}) {
  const router = useRouter();
  const startIndexOf = (n: number) => surahs.find((s) => s.number === n)?.order_index;

  // The current profile, re-expressed as an end surah so the form has one
  // vocabulary. targetCount counts from the start, inclusive.
  const initialStart = current?.startSurah ?? 114;
  const initialEnd = current
    ? (surahs.find(
        (s) => s.order_index === (startIndexOf(current.startSurah) ?? 1) + current.targetCount - 1,
      )?.number ?? null)
    : null;

  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState<number | null>(initialEnd);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const presets = targetPresets(start, surahs);
  const fromIdx = startIndexOf(start) ?? 1;
  const endOptions = surahs.filter((s) => s.order_index >= fromIdx);
  const count = end === null ? null : countTo(start, end, surahs);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Target</h2>
        <span className="text-xs text-muted-foreground">
          {current
            ? current.isCustom
              ? "custom target"
              : "class default"
            : "no target set"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <FilterSelect
          label="Starts at"
          value={String(start)}
          options={surahs.map((s) => ({ value: String(s.number), label: `${s.name_en} (${s.number})` }))}
          onChange={(v) => {
            const next = Number(v);
            setStart(next);
            setSaved(false);
            // An end the new start has walked past would store a negative run.
            if (end !== null && countTo(next, end, surahs) === null) setEnd(null);
          }}
        />
        <FilterSelect
          label="Up to"
          value={end === null ? "" : String(end)}
          options={[
            { value: "", label: "Choose a surah…" },
            ...endOptions.map((s) => ({ value: String(s.number), label: `${s.name_en} (${s.number})` })),
          ]}
          onChange={(v) => { setEnd(v === "" ? null : Number(v)); setSaved(false); }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <Button
            key={p.hizb}
            size="sm"
            variant={end === p.endSurah ? "default" : "outline"}
            disabled={pending}
            onClick={() => { setEnd(p.endSurah); setSaved(false); }}
          >
            {p.label} · {p.count}
          </Button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending || count === null}
          onClick={() =>
            startTransition(async () => {
              await setStudentHifzProfile(studentId, start, count!);
              setSaved(true);
              router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save target"}
        </Button>
        <span className={cn("text-xs", saved ? "text-ok" : "text-muted-foreground")} aria-live="polite">
          {saved
            ? "Saved — this student now has a custom target."
            : count !== null
              ? `= ${count} surah${count === 1 ? "" : "s"}`
              : "Pick where the target ends."}
        </span>
      </div>
    </div>
  );
}
