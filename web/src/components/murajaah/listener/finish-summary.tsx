"use client";

/**
 * After Finish: the session's verdict, its splits, its marks with optional
 * types, a note, and Save / Discard. Save sets the types, then submits.
 * Discard asks inline. There is no going back to the session: the clock
 * cannot resume after Finish.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BAND_LABEL, BAND_TONE, bandOf, formatClock } from "@/lib/murajaah/bands";
import { stretchesOf } from "@/lib/murajaah/checkpoints";
import type { MarkCategory, MarkView } from "@/lib/murajaah/sessions";
import { cn } from "@/lib/utils";
import { allowedCategories, CATEGORY_LABEL, limitLine } from "./listener-logic";
import { BandPill } from "./session-controls";
import { idealLine } from "./title-line";
import type { Draft } from "./use-listener-session";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "87:3, word 4", "87:3, whole ayah", or "Mistake +1". */
export function markPlace(m: Pick<MarkView, "surah" | "ayah" | "position">): string {
  if (m.surah === null || m.ayah === null) return "Mistake +1";
  return m.position === null ? `${m.surah}:${m.ayah}, whole ayah` : `${m.surah}:${m.ayah}, word ${m.position}`;
}

export function FinishSummary({
  draft, teacherName, saving, onSave, onDiscard,
}: {
  draft: Draft;
  teacherName: string;
  saving: boolean;
  onSave: (types: Record<string, MarkCategory | null>, note: string) => void;
  onDiscard: () => void;
}) {
  const [types, setTypes] = useState<Record<string, MarkCategory | null>>(() =>
    Object.fromEntries(draft.marks.map((m) => [m.id, m.category])),
  );
  const [note, setNote] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const total = draft.clock.elapsed_ms;
  const band = bandOf(total, draft.hizbEq, draft.minutes);
  const n = draft.marks.length;
  const onWords = draft.marks.filter((m) => m.surah !== null).length;
  const met = n <= draft.limit;
  const stretches = stretchesOf({
    kind: draft.sel.kind, ns: draft.sel.ns, minutes: draft.minutes, endMs: total,
    markAts: draft.marks.map((m) => m.atMs),
    ticked: draft.checkpoints.map((c) => ({ kind: c.kind, ord: c.ord, label: c.label, atMs: c.atMs })),
  });
  const marks = [...draft.marks].sort((a, b) => a.atMs - b.atMs);

  return (
    <section aria-labelledby="mj-sum-title" className="grid gap-3.5">
      <div>
        <h2 id="mj-sum-title" tabIndex={-1} className="text-xl font-bold outline-none">Session finished</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {draft.reciter.name} · {draft.label} · Target: {limitLine(draft.limit)}, set by {teacherName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-md:gap-2">
        <div className={cn("grid content-start gap-1 rounded-xl p-4 max-md:p-3", BAND_TONE[band].pill)}>
          <div className="text-[11px] font-bold uppercase tracking-[0.07em]">Total time</div>
          <div className="text-[2rem] leading-tight font-bold tabular-nums max-md:text-[1.6rem]">{formatClock(total)}</div>
          <div className="text-[13px]">{BAND_LABEL[band]} for {draft.label} · {idealLine(draft.sel, draft.minutes)}</div>
        </div>
        <div className="grid content-start gap-1 rounded-xl border border-line bg-card p-4 max-md:p-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Mistakes</div>
          <div className="text-[2rem] leading-tight font-bold tabular-nums max-md:text-[1.6rem]">{n}</div>
          <div className="text-[13px] text-muted-foreground">{onWords} on words · {n - onWords} with +1</div>
          <div>
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", met ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger")}>
              {met ? "Target met" : "Target missed"}
            </span>
          </div>
        </div>
      </div>

      {stretches.length > 1 && (
        <section className="rounded-xl border border-line bg-card p-4">
          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Splits</h3>
          <ul>
            {stretches.map((s, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line py-2 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{s.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatClock(s.fromMs)}–{formatClock(s.toMs)}{s.kind === "added" ? " · added, no band" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[12.5px] text-muted-foreground">{plural(s.mistakes, "mistake")}</span>
                  <BandPill band={s.band}>{formatClock(s.ms)}</BandPill>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-line bg-card p-4">
        <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">Mistake types (optional)</h3>
        {marks.length ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">Give a mark a type if it helps, or leave it.</p>
            <ul className="grid gap-2">
              {marks.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                  <span className="text-sm">
                    <span className="font-semibold">{markPlace(m)}</span>
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">at {formatClock(m.atMs)}</span>
                  </span>
                  <span role="group" aria-label={`Type for ${markPlace(m)} at ${formatClock(m.atMs)}`} className="flex flex-wrap gap-1.5">
                    {allowedCategories(m).map((c) => {
                      const on = types[m.id] === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setTypes((t) => ({ ...t, [m.id]: on ? null : c }))}
                          className={cn(
                            "h-8 rounded-lg border border-line bg-card px-2.5 text-[13px] hover:border-brand max-md:h-11",
                            on && "border-transparent bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] font-semibold",
                          )}
                        >
                          {CATEGORY_LABEL[c]}
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No mistakes were marked.</p>
        )}
      </section>

      <label className="grid gap-1.5 text-sm">
        <span className="font-semibold">Note (optional)</span>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
          placeholder="Anything to remember about this recitation" />
      </label>

      {confirmDiscard ? (
        <div role="alert" className="grid gap-2.5 rounded-xl border border-line bg-muted p-3">
          <p className="text-sm">Discard this session? Nothing of it is saved.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="destructive" disabled={saving} onClick={onDiscard}>Discard</Button>
            <Button size="lg" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep it</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={saving} onClick={() => onSave(types, note)}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="lg" variant="outline" disabled={saving} onClick={() => setConfirmDiscard(true)}>Discard</Button>
        </div>
      )}
    </section>
  );
}
