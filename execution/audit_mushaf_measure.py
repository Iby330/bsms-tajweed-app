#!/usr/bin/env python3
"""audit_mushaf_measure.py — the natural measure of every printed page.

Why this exists
---------------
QCF v1 is ONE FONT PER PAGE, and each page's font is cut to that page's own
engraving. The natural width of a filled line is therefore a property of the
font, and it is NOT the same across pages: page 594 fills at 14.85em, page
582 at 15.00em, page 585 at 15.55em. Render them all at one font-size and
they come out different physical widths; force them all to one width and
justification has to invent the difference as inter-word space — which is
exactly the "gaps between the words got big" failure.

So the reader lets each page take its own natural width, and the ornamental
band — whose glyph has ONE fixed aspect (8.047) and has to be stretched to
span the text — needs to know that width to stretch by the right amount. A
single hard-coded stretch overshoots narrow pages by up to 9% and pushes the
cartouche past the frame's side rules.

This script computes, per page, the width of its widest natural line by
summing glyph advances straight from the page font — the same method the
original measure audit used, and it reproduces that audit's headline number
(15.549em on page 585) exactly — and emits the table the reader needs.

Run:  python3 execution/audit_mushaf_measure.py
Output: a TS table on stdout, ready to paste into web/src/lib/quran/mushaf.ts
Read-only: touches the DB for line data and the fonts for metrics. Writes
nothing.
"""
from fontTools.ttLib import TTFont
from pathlib import Path
from urllib.request import Request, urlopen
import json
import sys

REPO = Path(__file__).resolve().parent.parent
FONTS = REPO / "web/public/fonts/qcf"
FIRST_PAGE, LAST_PAGE = 562, 604


def load_env() -> dict:
    env = {}
    for line in (REPO / "web/.env.local").read_text().splitlines():
        i = line.find("=")
        if i > 0:
            env[line[:i].strip()] = line[i + 1:].strip()
    return env


def fetch_words(env: dict) -> list:
    """quran_words for the seeded page range, in printed reading order."""
    base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    rows, offset, page_size = [], 0, 1000
    while True:
        url = (f"{base}/rest/v1/quran_words"
               f"?select=page_number,line_number,code_v1,surah_number,ayah_number,word_position"
               f"&page_number=gte.{FIRST_PAGE}&page_number=lte.{LAST_PAGE}"
               f"&order=surah_number.asc,ayah_number.asc,word_position.asc"
               f"&offset={offset}&limit={page_size}")
        req = Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urlopen(req) as r:
            batch = json.loads(r.read())
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def advances(page: int) -> tuple:
    """(char -> advance, space advance, upem) for one page's font."""
    f = TTFont(FONTS / f"QCF_P{page:03d}.woff2")
    upem = f["head"].unitsPerEm
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    by_char = {}
    for cp, glyph in cmap.items():
        by_char[chr(cp)] = hmtx[glyph][0]
    space = by_char.get(" ", 0)
    return by_char, space, upem


def main():
    env = load_env()
    print("fetching line data…", file=sys.stderr)
    rows = fetch_words(env)
    print(f"  {len(rows)} words", file=sys.stderr)

    # page -> line -> [code_v1, …] in reading order
    pages = {}
    for r in rows:
        if not r["code_v1"]:
            continue
        pages.setdefault(r["page_number"], {}).setdefault(r["line_number"], []).append(r["code_v1"])

    table, report = {}, []
    for page in sorted(pages):
        by_char, space, upem = advances(page)
        widths = []
        for line, codes in sorted(pages[page].items()):
            # the reader emits `glyph` + a space after EVERY word; the space
            # that ends the line is trimmed by the line breaker, so n-1 count.
            #
            # code_v1 is USUALLY one PUA character per word, but not always:
            # 95 of the 5964 seeded words carry two or three (ayah markers
            # whose number needs more than one glyph). Summing per WORD
            # instead of per CHARACTER silently scored those words as zero
            # width, which made their lines look far shorter than they are
            # and understated the page's measure. Iterate characters.
            ink = sum(by_char.get(ch, 0) for code in codes for ch in code)
            widths.append((ink + space * (len(codes) - 1)) / upem)
        widest = max(widths)
        table[page] = widest
        report.append((page, widest, min(widths), len(widths)))

    target = max(table.values())
    print(f"\nwidest natural measure across all pages: {target:.4f}em "
          f"(page {max(table, key=table.get)})", file=sys.stderr)
    print(f"narrowest: {min(table.values()):.4f}em "
          f"(page {min(table, key=table.get)})\n", file=sys.stderr)

    for page, widest, narrowest, n in report:
        print(f"  p{page}  widest {widest:7.4f}em  narrowest {narrowest:7.4f}em  "
              f"lines {n:2d}  scale {target / widest:.4f}", file=sys.stderr)

    # emit the TS table: natural measure per page, in em of that page's font
    print("/**")
    print(" * page → the natural width of its widest line, in em of that page's own")
    print(" * QCF font. QCF v1 is one font per page and each is cut to its own")
    print(" * engraving, so this is NOT a constant: it runs from 14.25em (604) to")
    print(" * 15.55em (585). The reader needs it to stretch the surah band to the")
    print(" * width of the text block — one fixed stretch overshoots narrow pages.")
    print(" *")
    print(" * Generated by execution/audit_mushaf_measure.py — do not hand-edit;")
    print(" * rerun the script if the seed changes.")
    print(" */")
    print("export const PAGE_MEASURE: Record<number, number> = {")
    for page in sorted(table):
        print(f"  {page}: {table[page]:.4f},")
    print("};")
    print()
    print("/** Fallback for a page outside the seeded range — the median measure. */")
    print(f"export const DEFAULT_MEASURE = {sorted(table.values())[len(table) // 2]:.4f};")


if __name__ == "__main__":
    main()
