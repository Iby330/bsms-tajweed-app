"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicNumber } from "@/lib/homework/tap-words";
import {
  HUNT_RULES, huntTally, huntWords,
  type HuntLetter, type HuntOption, type HuntRule, type HuntWord,
} from "@/lib/homework/rule-hunt";
import { cn } from "@/lib/utils";

const NAME = Object.fromEntries(HUNT_RULES.map((r) => [r.id, r.name])) as Record<HuntRule, string>;

/** Letters that never join the one after them, for the tiles in the sheet. */
const RIGHT_ONLY = new Set("اأإآٱدذرزوؤةء");
const ZWJ = "‍";

/** A letter out of its word keeps the form it has in the word. */
function joinedForms(word: HuntWord): string[] {
  const base = (l: HuntLetter) => l.value[0] ?? "";
  return word.letters.map((l, i) => {
    const prev = word.letters[i - 1];
    const next = word.letters[i + 1];
    const fromPrev = !!prev && !RIGHT_ONLY.has(base(prev)) && base(l) !== "ء";
    const toNext = !!next && !RIGHT_ONLY.has(base(l)) && base(next) !== "ء";
    return `${fromPrev ? ZWJ : ""}${l.value}${toNext ? ZWJ : ""}`;
  });
}

/**
 * A surah with every letter tappable and a rule to name on each: see
 * lib/homework/rule-hunt.ts for the shape underneath.
 *
 * Tap a letter to open its rules, or pick a rule first and tap letter after
 * letter. `reveal` is the marked view: found, wrongly tagged, missed, with a
 * line per rule that narrows the passage to that rule.
 */
export function RuleHunt({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
}: {
  options: HuntOption[];
  selected: number[];
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  reveal?: boolean;
}) {
  const words = useMemo(() => huntWords(options), [options]);
  const chosen = useMemo(() => new Set(selected), [selected]);
  const tally = useMemo(() => (reveal ? huntTally(options, selected) : null), [reveal, options, selected]);
  const [brush, setBrush] = useState<HuntRule | null>(null);
  const [focus, setFocus] = useState<HuntRule | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [scale, setScale] = useState(1);

  const toggle = (position: number) => {
    if (readOnly || !onChange) return;
    onChange(chosen.has(position) ? selected.filter((p) => p !== position) : [...selected, position]);
  };

  const tagsOf = (l: HuntLetter) => HUNT_RULES.filter((r) => {
    const o = l.options[r.id];
    return o && chosen.has(o.position);
  }).map((r) => r.id);

  const tap = (l: HuntLetter) => {
    const o = brush && l.options[brush];
    if (o) toggle(o.position);
    else setOpen(l.key);
  };

  const countOf = (rule: HuntRule) =>
    options.filter((o) => chosen.has(o.position) && o.label.endsWith(`:${rule}`)).length;

  const openWord = open ? words.find((w) => w.letters.some((l) => l.key === open)) : undefined;
  const openLetter = openWord?.letters.find((l) => l.key === open);

  return (
    <div className="space-y-3">
      {!readOnly && (
        // Every rule on screen at once, wrapping onto a second line on a
        // phone, and pinned there while the surah scrolls. A single row that
        // scrolled sideways hid half the rules (Moadh, 11 Nov).
        <div
          role="toolbar"
          aria-label="Pick a rule, then tap letters"
          className="hunt-rules -mx-1 flex flex-wrap gap-1.5 bg-card px-1 py-2"
        >
          {HUNT_RULES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={brush === r.id}
              onClick={() => setBrush(brush === r.id ? null : r.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                brush === r.id ? "border-primary bg-primary text-primary-foreground" : "border-line bg-card hover:bg-muted",
              )}
            >
              {r.name}
              {countOf(r.id) > 0 && <span className="tabular-nums opacity-75">{countOf(r.id)}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
          {readOnly
            ? "Tap a letter to see its rules."
            : brush
              ? `Marking ${NAME[brush]}: tap letters to add or remove it. Tap the rule again to stop.`
              : "Tap a letter to choose its rule, or pick a rule above first."}
        </p>
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" variant="outline" size="sm" aria-label="Smaller text" onClick={() => setScale((s) => Math.max(0.8, s - 0.15))}>A−</Button>
          <Button type="button" variant="outline" size="sm" aria-label="Bigger text" onClick={() => setScale((s) => Math.min(2, s + 0.15))}>A+</Button>
        </div>
      </div>

      <div
        dir="rtl"
        lang="ar"
        className="ar-tap rule-hunt rounded-lg border border-line bg-page px-4 py-5"
        style={scale === 1 ? undefined : { fontSize: `calc(clamp(1.5rem, 3.4vw, 2rem) * ${scale})` }}
      >
        {words.map((w) => (
          <span key={`${w.ayah}:${w.word}`}>
            <span className="whitespace-nowrap">
              {w.letters.map((l) => {
                const tags = tagsOf(l);
                const inView = (rule: string) => !focus || rule === focus;
                const here = Object.entries(l.options).filter(([rule]) => inView(rule)).map(([, o]) => o!);
                const wrong = !!tally && here.some((o) => chosen.has(o.position) && !o.correct);
                const hit = !!tally && here.some((o) => chosen.has(o.position) && o.correct);
                const missed = !!tally && here.some((o) => tally.missed.has(o.position));
                return (
                  <span
                    key={l.key}
                    role="button"
                    tabIndex={0}
                    aria-haspopup={brush ? undefined : "dialog"}
                    aria-label={`letter ${l.value}${tags.length ? `, tagged ${tags.map((t) => NAME[t]).join(", ")}` : ""}`}
                    onClick={() => (readOnly ? setOpen(l.key) : tap(l))}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        if (readOnly) setOpen(l.key);
                        else tap(l);
                      }
                    }}
                    data-state={wrong ? "wrong" : missed && !hit ? "missed" : hit ? "hit" : !tally && tags.length ? (brush && !tags.includes(brush) ? "tagged-dim" : "tagged") : undefined}
                    data-also-missed={hit && missed ? "" : undefined}
                    className="hunt-letter cursor-pointer outline-none"
                  >
                    {l.value}
                  </span>
                );
              })}
            </span>{" "}
            {w.endsAyah && (
              <>
                <span aria-label={`ayah ${w.ayah}`} className="text-ink-3">﴿{arabicNumber(w.ayah)}﴾</span>{" "}
              </>
            )}
          </span>
        ))}
      </div>

      {tally ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium tabular-nums">{tally.found} of {tally.total} found</span>
            {", "}
            <span className="tabular-nums">{tally.wrong} wrong tag{tally.wrong === 1 ? "" : "s"}</span>.
            <span className="text-muted-foreground"> Each wrong tag cancels one found.</span>
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="rounded-sm bg-ok/20 px-1 text-ok">Found</span> ·{" "}
            <span className="rounded-sm bg-danger/20 px-1 text-danger">wrong rule on that letter</span> ·{" "}
            <span className="rounded-sm bg-miss px-1 text-[#00004d]">missed</span>
          </p>
          <ul className="divide-y divide-line rounded-md border border-line">
            {tally.rules.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-pressed={focus === r.id}
                  onClick={() => setFocus(focus === r.id ? null : r.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                    focus === r.id && "bg-brand/15",
                  )}
                >
                  <span className="min-w-0 font-medium">{r.name}</span>
                  <span className="flex shrink-0 gap-3 text-xs tabular-nums">
                    <span>{r.total === 0 ? "none to find" : `${r.found}/${r.total} found`}</span>
                    <span className={cn(r.wrong > 0 ? "font-medium text-danger" : "text-muted-foreground")}>{r.wrong} wrong</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {focus ? `Showing only ${NAME[focus]}. Tap it again to show every rule.` : "Tap a rule to see only that rule in the surah."}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            {selected.length === 0 ? "No tags yet." : `${selected.length} tag${selected.length === 1 ? "" : "s"} placed.`}
          </p>
          {!readOnly && selected.length > 0 && (
            <Button
              type="button"
              variant={clearing ? "destructive" : "outline"}
              size="sm"
              onClick={() => {
                if (!clearing) {
                  setClearing(true);
                  setTimeout(() => setClearing(false), 3000);
                  return;
                }
                setClearing(false);
                onChange?.([]);
              }}
            >
              {clearing ? "Tap again to clear all" : "Clear my tags"}
            </Button>
          )}
        </div>
      )}

      <Dialog open={!!openLetter} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ayah {openWord?.ayah}, word {openWord?.word}</DialogTitle>
            <DialogDescription>
              {readOnly ? "The rules on this letter." : "Tap every rule on this letter."}
            </DialogDescription>
          </DialogHeader>
          {openWord && openLetter && (
            <>
              <div dir="rtl" lang="ar" className="flex flex-wrap justify-center gap-1.5">
                {joinedForms(openWord).map((form, i) => {
                  const l = openWord.letters[i];
                  return (
                    <button
                      key={l.key}
                      type="button"
                      aria-pressed={l.key === open}
                      aria-label={`letter ${l.value}`}
                      onClick={() => setOpen(l.key)}
                      style={{ fontFamily: '"Uthmanic Hafs", var(--font-quran)' }}
                      className={cn(
                        "relative min-w-11 rounded-lg border px-2 text-3xl leading-[2] transition-colors",
                        l.key === open ? "border-brand bg-brand/15 text-brand" : "border-line bg-page",
                      )}
                    >
                      {form}
                      {tagsOf(l).length > 0 && <span aria-hidden className="absolute top-1 right-1 size-1.5 rounded-full bg-brand" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HUNT_RULES.map((r) => {
                  const o = openLetter.options[r.id];
                  if (!o) return null;
                  const on = chosen.has(o.position);
                  const missed = !!tally?.missed.has(o.position);
                  // The marked view lists what happened on this letter and nothing else.
                  if (readOnly && !on && !missed) return null;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      disabled={readOnly}
                      onClick={() => toggle(o.position)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                        !tally && on && "border-primary bg-primary text-primary-foreground",
                        !tally && !on && "border-line hover:bg-muted",
                        tally && on && o.correct && "border-ok bg-ok/20 text-ok",
                        tally && on && !o.correct && "border-danger bg-danger/20 text-danger",
                        tally && !on && "border-miss bg-miss text-[#00004d]",
                      )}
                    >
                      {r.name}
                      {tally && <span className="text-xs font-normal">{on ? (o.correct ? "right" : "wrong") : "missed"}</span>}
                    </button>
                  );
                })}
                {readOnly && tagsOf(openLetter).length === 0 && !HUNT_RULES.some((r) => {
                  const o = openLetter.options[r.id];
                  return o && tally?.missed.has(o.position);
                }) && <p className="text-sm text-muted-foreground">Nothing tagged on this letter.</p>}
              </div>
              {!readOnly && (
                <div className="flex justify-end">
                  <Button type="button" onClick={() => setOpen(null)}>Done</Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
