"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/app/filter-select";
import { setClassTarget } from "@/lib/hifz/actions";
import { countTo, type TargetPreset } from "@/lib/hifz/targets";
import type { Surah } from "@/lib/hifz/pace";
import { cn } from "@/lib/utils";

/**
 * The class-wide default on the hifz register. Everything the teacher picks —
 * a hizb chip or a custom end surah — resolves to one end surah; the count
 * stored is derived from it, never typed. Nothing is preselected: a target
 * for twenty students shouldn't be one accidental tap.
 */
export function ClassTargetForm({
  presets, surahs, defaultCount, customCount,
}: {
  presets: TargetPreset[];
  /** The run in memorisation order (start 114). */
  surahs: Surah[];
  /** Students the apply will write — roster minus custom targets. */
  defaultCount: number;
  customCount: number;
}) {
  const router = useRouter();
  const [end, setEnd] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const count = end === null ? null : countTo(114, end, surahs);

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Class target</h2>
        <span className="text-xs text-muted-foreground">
          applies to {defaultCount} student{defaultCount === 1 ? "" : "s"}
          {customCount > 0 && ` · ${customCount} custom target${customCount === 1 ? "" : "s"} kept`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <Button
            key={p.hizb}
            size="sm"
            variant={!custom && end === p.endSurah ? "default" : "outline"}
            disabled={pending}
            onClick={() => { setEnd(p.endSurah); setCustom(false); setSaved(false); }}
          >
            {p.label} · {p.count}
          </Button>
        ))}
        <Button
          size="sm"
          variant={custom ? "default" : "outline"}
          disabled={pending}
          onClick={() => { setCustom(true); setEnd(null); setSaved(false); }}
        >
          Custom…
        </Button>
        {custom && (
          <FilterSelect
            label="Memorize up to"
            value={end === null ? "" : String(end)}
            options={[
              { value: "", label: "Choose a surah…" },
              ...surahs.map((s) => ({ value: String(s.number), label: `${s.name_en} (${s.number})` })),
            ]}
            onChange={(v) => { setEnd(v === "" ? null : Number(v)); setSaved(false); }}
          />
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending || count === null || defaultCount === 0}
          onClick={() =>
            startTransition(async () => {
              await setClassTarget(count!);
              setSaved(true);
              router.refresh();
            })
          }
        >
          {pending ? "Applying…" : "Apply to class"}
        </Button>
        <span className={cn("text-xs", saved ? "text-ok" : "text-muted-foreground")} aria-live="polite">
          {saved
            ? "Applied — the register below is updated."
            : count !== null
              ? `= ${count} surah${count === 1 ? "" : "s"} each`
              : "Pick a target to apply."}
        </span>
      </div>
    </div>
  );
}
