"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fromRow, groupIntoPages, type MushafPage, type QuranWordRow } from "@/lib/quran/mushaf";
import { spreadHeat, type WordHistoryEntry } from "@/lib/hifz/heat-spread";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import { pageFont } from "./mushaf-reader";

/**
 * A pager that turns in the browser rather than by navigating.
 *
 * `tint` is what the server would have tinted every page with — past hearing
 * marks, or a partner's — so the heat of a page turned to here matches the
 * heat of the same page loaded fresh. Without it the pages are left plain.
 */
export type LivePager = {
  page: number;
  min: number;
  max: number;
  /** The query key that carries the page, kept current in the address bar. */
  param: string;
  tint?: MistakeRow[];
};

type View = {
  page: number;
  pages: MushafPage[];
  heat: Record<string, string>;
  history: Record<string, WordHistoryEntry[]>;
};

// Module-wide: a page's words and font are the same for every student, so a
// page fetched while hearing one is ready for the next.
const wordsOf = new Map<number, Promise<QuranWordRow[]>>();
const fontOf = new Map<number, Promise<void>>();

function loadWords(page: number): Promise<QuranWordRow[]> {
  let p = wordsOf.get(page);
  if (!p) {
    p = fetch(`/api/mushaf/${page}`).then((r) => {
      if (!r.ok) throw new Error(`Page ${page} could not be loaded (${r.status}).`);
      return r.json() as Promise<QuranWordRow[]>;
    });
    // A failure is not remembered: the next turn to this page tries again.
    p.catch(() => wordsOf.delete(page));
    wordsOf.set(page, p);
  }
  return p;
}

/**
 * The page's QCF font, loaded ahead. The reader declares it `font-display:
 * block`, so a page whose font is still downloading shows no words at all;
 * loading it first means the swap paints the glyphs at once.
 */
function loadFont(page: number): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  let p = fontOf.get(page);
  if (!p) {
    const name = pageFont(page);
    const face = new FontFace(name, `url(/fonts/qcf/${name}.woff2)`, { display: "block" });
    p = face.load().then(
      (f) => { document.fonts.add(f); },
      // Not fatal — the reader's own @font-face still fetches it.
      () => { fontOf.delete(page); },
    );
    fontOf.set(page, p);
  }
  return p;
}

/**
 * What the reader shows, and how to turn it. Without `live` this is inert:
 * the given pages are shown and turning is left to navigation.
 */
export function useLivePages(
  given: { pages: MushafPage[]; heat?: Record<string, string>; history?: Record<string, WordHistoryEntry[]> },
  live: LivePager | undefined,
) {
  const router = useRouter();
  const fromProps = (): View => ({
    page: live?.page ?? 0, pages: given.pages, heat: given.heat ?? {}, history: given.history ?? {},
  });
  const [view, setView] = useState<View>(fromProps);
  const [turning, setTurning] = useState(false);
  const wanted = useRef(view.page);

  // A server render (a refresh after a result, say) hands down new pages:
  // they are the truth, so adopt them.
  const [seen, setSeen] = useState(given.pages);
  if (seen !== given.pages) {
    setSeen(given.pages);
    setView(fromProps());
  }

  // Primitives, so `turn` keeps its identity across renders: callers hand
  // it to effects and memoised callbacks, and a fresh one each render would
  // re-run them.
  const on = live !== undefined;
  const lo = live?.min ?? 0;
  const hi = live?.max ?? 0;
  const key = live?.param ?? "";
  const tint = live?.tint;

  const turn = useCallback(async (page: number) => {
    if (!on || page < lo || page > hi) return;
    wanted.current = page;
    setTurning(true);
    try {
      const [rows] = await Promise.all([loadWords(page), loadFont(page)]);
      if (wanted.current !== page) return; // a later turn overtook this one
      const words = rows.map(fromRow);
      const { heat, history } = tint
        ? spreadHeat(words, tint, new Date())
        : { heat: {}, history: {} };
      setView({ page, pages: groupIntoPages(words), heat, history });
      // The address bar keeps up, so a reload or a shared link opens here.
      // Replaced rather than pushed: Back leaves the tab, as a turned page
      // is not somewhere the teacher went.
      const url = new URL(window.location.href);
      url.searchParams.set(key, String(page));
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    } catch {
      // The old way still works: navigate, and let the server render it.
      const url = new URL(window.location.href);
      url.searchParams.set(key, String(page));
      router.push(`${url.pathname}${url.search}`, { scroll: false });
    } finally {
      if (wanted.current === page) setTurning(false);
    }
  }, [on, lo, hi, key, tint, router]);

  // Both neighbours, words and font, so the next turn is immediate.
  const page = view.page;
  const min = live?.min;
  const max = live?.max;
  useEffect(() => {
    if (min === undefined || max === undefined) return;
    for (const n of [page - 1, page + 1]) {
      if (n < min || n > max) continue;
      loadWords(n).catch(() => {});
      void loadFont(n);
    }
  }, [page, min, max]);

  return { view, turning, turn: live ? turn : undefined };
}
