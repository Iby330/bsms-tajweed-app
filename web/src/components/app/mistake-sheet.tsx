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
 * The two-level quick pick for one tapped word: category → specific (rule /
 * letter / slip) → optional note. Mount with key={wordKey(word)} so state
 * resets per word.
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

  const details =
    category === "makhraj"
      ? (word ? lettersOf(word.text).map((l) => ({ id: l, label: l })) : [])
      : category
        ? DETAILS[category]
        : [];

  return (
    <Dialog open={word !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm space-y-3">
        <DialogHeader>
          <DialogTitle dir="rtl" lang="ar" className="ar-quran text-center">
            {word?.text}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORIES.map((c) => (
            <Button key={c.id} size="sm" variant={category === c.id ? "default" : "outline"}
              onClick={() => { setCategory(c.id); setDetail(null); }}>
              {c.label}
            </Button>
          ))}
        </div>
        {details.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
          placeholder="Note (optional)" className="h-8 text-sm" />
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
