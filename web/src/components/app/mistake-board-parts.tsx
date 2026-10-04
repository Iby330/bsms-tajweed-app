"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Category } from "@/lib/hifz/mistake-taxonomy";
import type { Source } from "@/lib/hifz/mistake-board";
import { cn } from "@/lib/utils";
import { CAT_BG, CAT_BORDER } from "./mistake-colors";

/** Filled for a teacher hearing, a ring for partner revision — the same mark
 *  under the session chart, so the source reads the same everywhere. */
export function SourceDot({ source, className }: { source: Source; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full border-[1.5px] border-foreground",
        source === "teacher" && "bg-foreground",
        className,
      )}
    />
  );
}

// ———————————————————————————————— surahs, most mistakes

export type SurahRank = { surah: number; name: string; count: number; href: string };

/** The top six surahs by mistakes; "All N surahs" opens the rest in place.
 *  Each row opens that surah in the heatmap below. */
export function SurahRanks({ ranks }: { ranks: SurahRank[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? ranks : ranks.slice(0, 6);
  const max = ranks[0]?.count ?? 1;
  return (
    <div className="flex flex-col">
      <ul className="flex flex-col" aria-label="Surahs, most mistakes first">
        {shown.map((r) => (
          <li key={r.surah}>
            <Link
              href={r.href}
              scroll={false}
              className="grid grid-cols-[minmax(0,7.5rem)_1fr_1.5rem_0.75rem] items-center gap-2.5 rounded-md py-1.5 text-sm hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="truncate">
                {r.name} <span className="text-xs tabular-nums text-ink-3">{r.surah}</span>
              </span>
              <span className="h-2 rounded-r-[3px] bg-foreground" style={{ width: `${(r.count / max) * 100}%` }} />
              <span className="text-right text-xs tabular-nums text-ink-2">{r.count}</span>
              <ChevronRight aria-hidden className="size-3 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
      {ranks.length > 6 && (
        <button
          type="button"
          onClick={() => setAll((a) => !a)}
          className="mt-1.5 self-start text-xs text-brand underline-offset-2 hover:underline"
        >
          {all ? "Show fewer" : `All ${ranks.length} surahs`}
        </button>
      )}
    </div>
  );
}

// ———————————————————————————————— ayahs to drill

export type DrillWord = { position: number; text: string; category: Category | null };
export type DrillCard = {
  key: string;
  surahName: string;
  surah: number;
  ayah: number;
  words: DrillWord[];
  wholeAyah: boolean;
  chips: { label: string; category: Category; count: number; who: string }[];
  sessions: Source[];        // one per session it came up in, oldest first
  href: string;
};

function Ayah({ card }: { card: DrillCard }) {
  return (
    <Link href={card.href} className="flex flex-col gap-2.5 rounded-md border border-line p-3.5 hover:bg-foreground/[0.03]">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {card.surahName} <span className="font-normal tabular-nums text-ink-3">{card.surah}:{card.ayah}</span>
        </span>
        {card.wholeAyah && <span className="text-xs text-ink-3">whole ayah</span>}
      </span>
      <span dir="rtl" lang="ar" className="ar-quran block text-right text-2xl leading-loose">
        {card.words.map((w, i) => (
          <span key={w.position}>
            {i > 0 && " "}
            <span className={cn(w.category && "border-b-2 pb-0.5", w.category && CAT_BORDER[w.category])}>
              {w.text}
            </span>
          </span>
        ))}
      </span>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1.5">
          {card.chips.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs">
              <span aria-hidden className={cn("size-2 rounded-full", CAT_BG[c.category])} />
              {c.label} ×{c.count}
              <span className="text-ink-3">· {c.who}</span>
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-ink-3">
          in {card.sessions.length} session{card.sessions.length === 1 ? "" : "s"}
          {card.sessions.slice(-9).map((s, i) => <SourceDot key={i} source={s} />)}
        </span>
      </span>
    </Link>
  );
}

/** One ayah at a time, hottest first. The arrows step through; See all lays
 *  every card out in place and Show less folds them back to one. */
export function DrillCarousel({ cards }: { cards: DrillCard[] }) {
  const [i, setI] = useState(0);
  const [all, setAll] = useState(false);
  const n = cards.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="label">Ayahs to drill <span className="normal-case tracking-normal">· hottest first</span></span>
        <span className="flex items-center gap-2">
          {!all && n > 1 && (
            <>
              <button type="button" aria-label="Previous ayah" disabled={i === 0}
                onClick={() => setI(i - 1)}
                className="grid size-8 place-items-center rounded-md border border-line disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-xs tabular-nums text-ink-2" aria-live="polite">{i + 1} of {n}</span>
              <button type="button" aria-label="Next ayah" disabled={i === n - 1}
                onClick={() => setI(i + 1)}
                className="grid size-8 place-items-center rounded-md border border-line disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </>
          )}
          {n > 1 && (
            <button type="button" onClick={() => setAll((a) => !a)}
              className="rounded-md border border-line px-2.5 py-1 text-xs">
              {all ? "Show less" : "See all"}
            </button>
          )}
        </span>
      </div>
      {all
        ? <div className="flex flex-col gap-2.5">{cards.map((c) => <Ayah key={c.key} card={c} />)}</div>
        : <Ayah card={cards[Math.min(i, n - 1)]} />}
      <p className="note">Tap an ayah to open it in the mushaf.</p>
    </div>
  );
}

// ———————————————————————————————— makhraj letters

export type LetterWord = { label: string; text: string; source: Source; href: string };

/** The 28 letters, tinted by how often each was marked. Tapping a marked
 *  letter lists the words it was marked on. */
export function MakhrajGrid({
  letters, counts, words,
}: {
  letters: string[];
  counts: Record<string, number>;
  words: Record<string, LetterWord[]>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const tint = (n: number) =>
    n >= 3 ? "bg-cat-makhraj text-white"
      : n === 2 ? "bg-cat-makhraj/45"
      : n === 1 ? "bg-cat-makhraj/20"
      : "bg-foreground/[0.05] text-ink-3";
  return (
    <>
      <div dir="rtl" className="grid grid-cols-7 gap-1">
        {letters.map((l) => {
          const n = counts[l] ?? 0;
          return (
            <button
              key={l}
              type="button"
              disabled={!n}
              onClick={() => setOpen(l)}
              aria-label={n ? `${l}: ${n} mark${n === 1 ? "" : "s"}` : `${l}: none`}
              className={cn("ar-quran grid aspect-square place-items-center rounded-[4px] text-lg leading-none", tint(n))}
            >
              {l}
            </button>
          );
        })}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="space-y-2">
          <DialogHeader>
            <DialogTitle className="text-center">
              Makhraj of <span className="ar-quran">{open}</span>
            </DialogTitle>
          </DialogHeader>
          <ul className="space-y-1.5" aria-label="Words this letter was marked on">
            {(open ? words[open] ?? [] : []).map((w, i) => (
              <li key={i}>
                <Link href={w.href} className="flex items-center justify-between gap-3 rounded-md bg-muted px-2.5 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <SourceDot source={w.source} />
                    {w.label}
                  </span>
                  <span dir="rtl" lang="ar" className="ar-quran text-base">{w.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ———————————————————————————————— surah picker for the heatmap

/**
 * Pick a surah for the heatmap. Closed, it is a choice and an Open button.
 * Once the heatmap is open the button becomes Close, and choosing another
 * surah opens it straight away: the reader is already looking.
 */
export function SurahPicker({
  options, selected, hrefFor, open, closeHref,
}: {
  options: { surah: number; name: string; count: number }[];
  selected: number | null;
  hrefFor: Record<number, string>;
  open: boolean;
  closeHref: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState<number>(selected ?? options[0]?.surah ?? 0);
  const go = (n: number) => {
    if (hrefFor[n]) router.push(hrefFor[n], { scroll: false });
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (open) router.push(closeHref, { scroll: false });
        else go(value);
      }}
    >
      <label htmlFor="heat-surah" className="sr-only">Surah</label>
      <select
        id="heat-surah"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          setValue(n);
          if (open) go(n);
        }}
        className="h-8 min-w-0 max-w-[14rem] rounded-md border border-line bg-card px-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.surah} value={o.surah}>
            {o.name}{o.count ? ` · ${o.count} mark${o.count === 1 ? "" : "s"}` : ""}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className={cn(
          "h-8 rounded-md px-3 text-sm",
          open ? "border border-line text-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        {open ? "Close" : "Open"}
      </button>
    </form>
  );
}

/**
 * On a phone, sibling panels of the board share one slot: a strip of figure
 * tiles across the top picks which panel shows below it, so three panels a
 * screen each become one row of tiles and one panel. From `md` up the strip
 * is hidden and every panel shows, in the desktop grid, as before.
 *
 * `display: contents` keeps the panels direct children of the `.field` grid,
 * so their desktop spans are untouched. Hiding is CSS (`globals.css`, under
 * "board tabs"), keyed on `data-active` here and `data-tab` on each panel.
 */
export function PhoneTabs({
  tabs,
  children,
}: {
  tabs: { id: string; label: string; figure: string }[];
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="contents boardtabs" data-active={active}>
      <div className="box c12 boardtabs-strip md:hidden" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
          >
            <span className="label">{t.label}</span>
            <span className="fig">{t.figure}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

