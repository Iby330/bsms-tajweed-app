"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MushafReader, type SurahNames } from "./mushaf-reader";
import { wordKey, type MushafPage, type QuranWord } from "@/lib/quran/mushaf";

export type WordHistoryEntry = { label: string; note: string | null; date: string };

/** Heat mode: tinted mushaf; tapping a hot word lists what went wrong there. */
export function HeatViewer({
  pages, heat, history, surahNames,
}: {
  pages: MushafPage[];
  heat: Record<string, string>;                    // wordKey → tint class
  history: Record<string, WordHistoryEntry[]>;     // wordKey → entries, newest first
  surahNames?: SurahNames;
}) {
  const [open, setOpen] = useState<{ word: QuranWord; entries: WordHistoryEntry[] } | null>(null);
  const onTap = (word: QuranWord) => {
    const entries = history[wordKey(word)];
    if (entries?.length) setOpen({ word, entries });
  };
  return (
    <>
      <MushafReader pages={pages} heat={heat} surahNames={surahNames} onWordTap={onTap} />
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-sm space-y-2">
          <DialogHeader>
            <DialogTitle dir="rtl" lang="ar" className="ar-quran text-center">
              {open?.word.text}
            </DialogTitle>
          </DialogHeader>
          <ul className="space-y-1.5">
            {open?.entries.map((e, i) => (
              <li key={i} className="rounded-md bg-muted px-2.5 py-1.5 text-xs">
                <span className="font-medium">{e.label}</span>
                <span className="ml-2 text-muted-foreground">
                  {new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                {e.note && <p className="mt-0.5 text-ink-2">{e.note}</p>}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
