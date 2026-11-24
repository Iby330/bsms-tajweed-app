"use client";

/**
 * The owner's check of the typeset Qur'an words against the pictures they
 * replace: one card per question, and per picture slot the picture on the
 * left (or on top, on a phone) and what the question now shows on the right.
 * One button per slot: "Keep the picture" or "Use the typeset words".
 *
 * Local state follows each answer from the server (`setAyahSlot`); a refusal
 * leaves the slot as it was and says why.
 */
import { useMemo, useState, useTransition } from "react";
import { MixedText } from "@/components/app/mixed-text";
import { Button } from "@/components/ui/button";
import { setAyahSlot } from "@/lib/exam-builder/bank-actions";
import { refLabel } from "@/lib/exam-builder/quran-lines";
import { filterEntries, type AyahEntry, type AyahFilter, type AyahSlot, type SlotUpdate } from "@/lib/exam-builder/ayah-review";
import type { BankQuestion } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { TypesetAyah } from "./typeset-ayah";

const PAGE = 20;

function applyUpdate(entry: AyahEntry, key: AyahSlot["key"], update: SlotUpdate): AyahEntry {
  const q: BankQuestion = {
    ...entry.question,
    ...(update.prompt_quran !== undefined ? { prompt_quran: update.prompt_quran } : null),
    ...(update.options !== undefined ? { options: update.options } : null),
    ...(update.prompt_images !== undefined ? { prompt_images: update.prompt_images } : null),
  };
  const slots = entry.slots.map((s): AyahSlot => {
    if (s.key !== key) return s;
    if (key === "prompt") return { ...s, ref: q.prompt_quran, typeset: !!q.prompt_quran };
    if (key === "term") return { ...s, typeset: !s.images.some((img) => q.prompt_images.includes(img)) };
    const o = q.options?.find((x) => `option:${x.image}` === key);
    return { ...s, ref: o?.quran ?? null, typeset: !!o?.quran };
  });
  return { ...entry, question: q, slots, kept: slots.some((s) => !s.typeset) };
}

function Picture({ path, url }: { path: string; url: string | undefined }) {
  if (!url) return <span className="rounded border border-dashed border-line px-2 py-1 text-xs text-muted-foreground">Picture missing</span>;
  // Signed, short-lived storage URLs: next/image would cache them past expiry.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="The original picture" title={path} className="max-h-40 max-w-full rounded border border-line bg-white p-1" />;
}

function Slot({ slot, question, onChoose }: { slot: AyahSlot; question: BankQuestion; onChoose: (use: boolean) => Promise<string | null> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (use: boolean) => start(async () => setError(await onChoose(use)));
  const shown = slot.typeset ? (slot.key === "term" ? null : slot.ref) : null;
  const label = slot.ref ? refLabel(slot.ref) : slot.proposed ? refLabel(slot.proposed) : null;

  return (
    <div className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{slot.label}</span>
        <span className={cn("rounded-full px-2 py-0.5 font-medium", slot.typeset ? "bg-brand/15 text-brand" : "bg-warn/15 text-warn")}>
          {slot.typeset ? (slot.key === "term" ? "Shows the typed term" : "Shows the typeset words") : "Shows the picture"}
        </span>
        {label && <span className="text-muted-foreground">{label}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <span className="text-xs text-muted-foreground">The picture</span>
          {slot.images.map((p) => <Picture key={p} path={p} url={question.imageUrls[p]} />)}
        </div>
        <div className="grid content-start gap-1.5">
          <span className="text-xs text-muted-foreground">{slot.key === "term" ? "The question now reads" : "Typeset from the mushaf"}</span>
          {slot.key === "term" ? (
            <p className="rounded-lg border border-line bg-white px-3 py-2 text-[#00004d]"><MixedText text={question.prompt} variant="auto" /></p>
          ) : (shown ?? slot.proposed) ? (
            <div className="rounded-lg border border-line bg-white px-3 py-2 text-[#00004d]">
              <TypesetAyah quran={(shown ?? slot.proposed)!} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No typeset words on record for this picture.</p>
          )}
        </div>
      </div>
      {slot.look.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-lg border border-warn/40 bg-warn/15 py-2 pr-3 pl-7 text-xs">
          {slot.look.map((l, i) => <li key={i}><MixedText text={l} variant="auto" /></li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {slot.typeset ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => choose(false)}>
            {pending ? "Saving…" : "Keep the picture"}
          </Button>
        ) : slot.proposed || slot.key === "term" ? (
          <Button size="sm" disabled={pending} onClick={() => choose(true)}>
            {pending ? "Saving…" : slot.key === "term" ? "Use the typed term" : "Use the typeset words"}
          </Button>
        ) : null}
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export function AyahCompare({ initial }: { initial: AyahEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const [filter, setFilter] = useState<AyahFilter>("all");
  const [limit, setLimit] = useState(PAGE);
  const counts = useMemo(
    () => ({ all: entries.length, look: filterEntries(entries, "look").length, kept: filterEntries(entries, "kept").length }),
    [entries],
  );
  const visible = filterEntries(entries, filter);

  const choose = (id: string, key: AyahSlot["key"]) => async (use: boolean): Promise<string | null> => {
    const r = await setAyahSlot(id, key, use);
    if (!r.ok) return r.error;
    setEntries((list) => list.map((e) => (e.question.id === id ? applyUpdate(e, key, r.update) : e)));
    return null;
  };

  const tabs: [AyahFilter, string][] = [["all", "All"], ["look", "Needs a look"], ["kept", "Kept as picture"]];

  return (
    <div className="space-y-5 pb-16">
      <div role="tablist" aria-label="Which questions" className="grid grid-cols-3 gap-2">
        {tabs.map(([f, label]) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => { setFilter(f); setLimit(PAGE); }}
            className={cn(
              "cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors",
              filter === f ? "border-brand/40 bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            <span className="block text-2xl font-semibold tabular-nums leading-none">{counts[f]}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          {filter === "kept" ? "Every question shows its typeset words." : "Nothing here."}
        </p>
      ) : (
        visible.slice(0, limit).map((e) => (
          <article key={e.question.id} className="overflow-hidden rounded-xl border border-border bg-card" aria-label={e.question.prompt.slice(0, 80)}>
            <header className="flex flex-wrap items-center gap-2 bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] px-4 py-2 text-sm">
              {e.needsLook && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">Needs a look</span>}
              {e.question.archived && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger">Binned</span>}
              <span className="text-xs text-muted-foreground">
                {e.question.used_in.length ? `Used in ${e.question.used_in.join(", ")}` : "Not used in an exam yet"}
                {e.question.sources.length ? ` · Found in ${e.question.sources.map((s) => (s.number ? `${s.label} (${s.number})` : s.label)).join(", ")}` : ""}
              </span>
            </header>
            <div className="grid gap-3 p-4">
              <p className="font-semibold"><MixedText text={e.question.prompt} variant="auto" /></p>
              {e.slots.map((s) => (
                <Slot key={s.key} slot={s} question={e.question} onChoose={choose(e.question.id, s.key)} />
              ))}
            </div>
          </article>
        ))
      )}
      {visible.length > limit && (
        <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, visible.length - limit)} more
        </Button>
      )}
    </div>
  );
}
