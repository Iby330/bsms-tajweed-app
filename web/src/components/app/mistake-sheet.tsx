"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES, DETAILS, lettersOf, type Category } from "@/lib/hifz/mistake-taxonomy";
import type { QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";

export type SheetResult = { category: Category; detail: string | null; note: string };

/**
 * The two-level quick pick for one tap: category → specific (rule / letter /
 * slip) → optional note. Mount with key={markKey(...)} so state resets per
 * target.
 *
 * Tapping an ayah's END MARKER classifies the whole ayah rather than a word
 * — forgetting an ayah outright is commoner than fumbling one word in it.
 * Makhraj is withheld in that mode by construction: its detail is a letter
 * of a particular word, so it cannot describe an ayah. The DB agrees
 * (revision_mistakes_ayah_scope_not_makhraj).
 */
export function MistakeSheet({
  word,
  existing,
  onSave,
  onRemove,
  onClose,
}: {
  word: QuranWord | null;
  existing?: { category: Category; detail: string | null; note: string | null };
  onSave: (r: SheetResult) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category | null>(existing?.category ?? null);
  const [detail, setDetail] = useState<string | null>(existing?.detail ?? null);
  const [note, setNote] = useState(existing?.note ?? "");

  // The end marker means "this whole ayah", not the marker glyph itself.
  const wholeAyah = word?.isEnd ?? false;
  const categories = wholeAyah ? CATEGORIES.filter((c) => c.id !== "makhraj") : CATEGORIES;

  const details =
    category === "makhraj"
      ? (word ? lettersOf(word.text).map((l) => ({ id: l, label: l })) : [])
      : category
        ? DETAILS[category]
        : [];

  return (
    <Dialog open={word !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="space-y-3">
        <DialogHeader>
          {wholeAyah ? (
            <DialogTitle className="text-center text-base">
              Whole ayah
              <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                {word!.surah}:{word!.ayah}
              </span>
            </DialogTitle>
          ) : (
            <DialogTitle dir="rtl" lang="ar" className="ar-quran text-center">
              {word?.text}
            </DialogTitle>
          )}
        </DialogHeader>
        {/* Fits the count: three categories on one row, two side by side.
            A fixed 2-col grid left Makhraj stranded alone on a second row. */}
        <div className={cn("grid gap-1.5", categories.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {categories.map((c) => (
            <Button key={c.id} size="sm" variant={category === c.id ? "default" : "outline"}
              onClick={() => { setCategory(c.id); setDetail(null); }}>
              {c.label}
            </Button>
          ))}
        </div>
        {details.length > 0 && (
          // Makhraj chips are Arabic letters, so the row runs RTL: lettersOf
          // returns them in reading order, and an LTR row put the word's
          // FIRST letter on the left — reading backwards, and starting from
          // the wrong edge. The rule chips stay LTR; their labels are English.
          <div
            dir={category === "makhraj" ? "rtl" : undefined}
            className="flex flex-wrap gap-1.5"
          >
            {details.map((d) => (
              <button key={d.id} type="button"
                onClick={() => setDetail(detail === d.id ? null : d.id)}
                className={cn(
                  "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                  category === "makhraj" && "ar-ui",
                  detail === d.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}>
                {d.label}
              </button>
            ))}
          </div>
        )}
        <Input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)" className="md:h-8" />
        <div className="flex items-center justify-between gap-2">
          {onRemove ? (
            <Button size="sm" variant="outline" onClick={onRemove}>Remove</Button>
          ) : <span />}
          <Button size="sm" disabled={!category}
            onClick={() => category && onSave({ category, detail, note })}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
