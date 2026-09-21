#!/usr/bin/env python3
"""
Repair U+06DF (ARABIC SMALL HIGH ROUNDED ZERO) in uthmanic_hafs_v22.

## The defect

The shipped font draws U+06DF as a near-em-sized ornament sitting ON the
baseline in its own advance slot, instead of a small hollow ring perched above
its carrier letter. Verified in the binary, not inferred:

    uni06DF   advance 1442/2048   GDEF class 1 (base)   13 contours
    uni06E0   advance    0/2048   GDEF class 3 (mark)    2 contours

Twelve of those thirteen contours are a ring of dots — a U+25CC dotted-circle
placeholder baked into the outline, the convention for showing a combining mark
in isolation. The thirteenth is a solid disc. So the glyph renders as a dashed
ring around a filled dot, roughly 70% of the height of the alif beside it.

U+06DF is the mark that tells a reciter a letter is SILENT — the alif fariqa in
`ءَامَنُوا۟` and `تَقْتُلُوا۟`. Drawing it at the wrong size in the wrong place
is an orthographic error in the text of the Qur'an, not a cosmetic one, and it
affects every Madani verse in the app carrying that mark, not just the landing
page.

## The repair

U+06E0 (SMALL HIGH UPRIGHT RECTANGULAR ZERO) is the correct sibling and the
model for all of it:

  1. Outline  — discard the twelve placeholder dots. Keep the disc, scale it to
                U+06E0's footprint, and cut a hole in it so it reads as a ring
                rather than a dot. U+06E0 is itself hollow (outer + inner
                contour), and its stroke width sets ours.
  2. Metrics  — advance 0, so it stops pushing the next word away.
  3. GDEF     — class 3 (mark), so shapers stop treating it as a letter.
  4. GPOS     — U+06E0 is anchored by twelve mark-to-base lookups. U+06DF is in
                none of them, so even once it is a zero-width mark it would land
                by shaper fallback rather than on the font's own anchors. We
                copy U+06E0's mark record into each of those lookups.

Step 4 is the one that is easy to miss and the reason this is a script rather
than a one-liner: fix the metrics alone and the mark is still misplaced, just
less obviously.

## Running it

    python execution/patch_uthmanic_hafs.py            # patch, writing backups
    python execution/patch_uthmanic_hafs.py --verify   # report state, change nothing

Both the .ttf and the .woff2 the browser actually loads are rewritten. Originals
are kept alongside as *.orig-<timestamp>, and the script refuses to run twice
over an already-patched file.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

from fontTools.misc.transform import Transform
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "fonts"
TTF = FONT_DIR / "uthmanic_hafs_v22.ttf"
WOFF2 = FONT_DIR / "uthmanic_hafs_v22.woff2"

BROKEN = 0x06DF  # small high rounded zero — the one we repair
MODEL = 0x06E0  # small high upright rectangular zero — correct, our template

MARK_CLASS = 3  # GDEF glyph class for a combining mark


def contours_of(font: TTFont, glyph_name: str) -> list[RecordingPen]:
    """Split a glyph into one RecordingPen per contour, in outline order."""
    rec = RecordingPen()
    font.getGlyphSet()[glyph_name].draw(rec)
    out: list[RecordingPen] = []
    current = RecordingPen()
    for op, args in rec.value:
        current.value.append((op, args))
        if op == "closePath":
            out.append(current)
            current = RecordingPen()
    if current.value:
        out.append(current)
    return out


def bounds_of(pen: RecordingPen) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for _op, args in pen.value:
        for pt in args:
            if isinstance(pt, tuple):
                xs.append(pt[0])
                ys.append(pt[1])
            elif isinstance(pt, (list,)):
                for p in pt:
                    if isinstance(p, tuple):
                        xs.append(p[0])
                        ys.append(p[1])
    return min(xs), min(ys), max(xs), max(ys)


def fit(src_box, dst_box) -> Transform:
    """Uniform scale + translate mapping one bbox onto another, centred."""
    sx0, sy0, sx1, sy1 = src_box
    dx0, dy0, dx1, dy1 = dst_box
    sw, sh = sx1 - sx0, sy1 - sy0
    dw, dh = dx1 - dx0, dy1 - dy0
    s = min(dw / sw, dh / sh)
    # centre the scaled source inside the destination box
    cx = dx0 + (dw - sw * s) / 2
    cy = dy0 + (dh - sh * s) / 2
    return Transform().translate(cx - sx0 * s, cy - sy0 * s).scale(s)


def describe(font: TTFont) -> dict:
    cmap = font.getBestCmap()
    gdef = font["GDEF"].table.GlyphClassDef.classDefs
    out = {}
    for cp in (BROKEN, MODEL):
        g = cmap[cp]
        out[cp] = {
            "glyph": g,
            "advance": font["hmtx"][g][0],
            "class": gdef.get(g),
            "contours": font["glyf"][g].numberOfContours,
            "gpos_lookups": gpos_mark_lookups(font, g),
        }
    return out


def gpos_mark_lookups(font: TTFont, glyph: str) -> list[int]:
    hits = []
    for i, lookup in enumerate(font["GPOS"].table.LookupList.Lookup):
        for sub in lookup.SubTable:
            cov = getattr(sub, "MarkCoverage", None)
            if cov and glyph in cov.glyphs:
                hits.append(i)
                break
    return hits


def patch(font: TTFont) -> None:
    cmap = font.getBestCmap()
    broken, model = cmap[BROKEN], cmap[MODEL]
    glyf = font["glyf"]

    # ── 1. Outline ────────────────────────────────────────────────────────
    # Keep only the largest contour: the twelve placeholder dots are small and
    # equal, the real mark is the one with the biggest area.
    parts = contours_of(font, broken)
    if len(parts) < 2:
        raise SystemExit(f"{broken}: expected a multi-contour glyph, got {len(parts)}")
    disc = max(parts, key=lambda p: (lambda b: (b[2] - b[0]) * (b[3] - b[1]))(bounds_of(p)))

    # The model's own two contours give us both the footprint and the stroke
    # width, so the repaired ring matches its sibling rather than a guess.
    m_outer, m_inner = contours_of(font, model)[:2]
    mo, mi = bounds_of(m_outer), bounds_of(m_inner)
    stroke = ((mo[2] - mo[0]) - (mi[2] - mi[0])) / 2

    # Keep the ring circular, sized to the model's width and vertically centred
    # in the model's height, so it sits at the height the other high marks do.
    width = mo[2] - mo[0]
    cy = (mo[1] + mo[3]) / 2
    outer_box = (mo[0], cy - width / 2, mo[0] + width, cy + width / 2)
    inner_box = (
        outer_box[0] + stroke,
        outer_box[1] + stroke,
        outer_box[2] - stroke,
        outer_box[3] - stroke,
    )

    src = bounds_of(disc)
    pen = TTGlyphPen(None)
    disc.replay(TransformPen(pen, fit(src, outer_box)))
    # Reversed winding cuts the hole that makes it a ring rather than a dot.
    disc.replay(TransformPen(ReverseContourPen(pen), fit(src, inner_box)))
    glyf[broken] = pen.glyph()

    # ── 2. Metrics ────────────────────────────────────────────────────────
    font["hmtx"][broken] = (0, int(outer_box[0]))

    # ── 3. GDEF ───────────────────────────────────────────────────────────
    font["GDEF"].table.GlyphClassDef.classDefs[broken] = MARK_CLASS

    # ── 4. GPOS ───────────────────────────────────────────────────────────
    # Coverage tables are compiled in glyph-ID order and MarkArray records are
    # positional, so the record must be inserted at the same index the glyph
    # takes in the sorted coverage — not appended.
    order = font.getGlyphOrder()
    gid = {g: i for i, g in enumerate(order)}
    patched = 0
    for lookup in font["GPOS"].table.LookupList.Lookup:
        for sub in lookup.SubTable:
            cov = getattr(sub, "MarkCoverage", None)
            if not cov or model not in cov.glyphs or broken in cov.glyphs:
                continue
            src_i = cov.glyphs.index(model)
            record = sub.MarkArray.MarkRecord[src_i]

            copy = type(record)()
            copy.Class = record.Class
            copy.MarkAnchor = record.MarkAnchor  # same attachment point as the model

            pos = 0
            while pos < len(cov.glyphs) and gid[cov.glyphs[pos]] < gid[broken]:
                pos += 1
            cov.glyphs.insert(pos, broken)
            sub.MarkArray.MarkRecord.insert(pos, copy)
            sub.MarkArray.MarkCount = len(sub.MarkArray.MarkRecord)
            patched += 1

    if not patched:
        raise SystemExit("no GPOS mark lookups matched — refusing to ship a half-fix")
    print(f"  wired into {patched} GPOS mark lookups")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--verify", action="store_true", help="report state, change nothing")
    args = ap.parse_args()

    if not TTF.exists():
        raise SystemExit(f"missing {TTF}")

    font = TTFont(TTF)
    before = describe(font)
    g = before[BROKEN]

    print(f"U+{BROKEN:04X} {g['glyph']}: advance={g['advance']} class={g['class']} "
          f"contours={g['contours']} gpos={len(g['gpos_lookups'])}")
    m = before[MODEL]
    print(f"U+{MODEL:04X} {m['glyph']}: advance={m['advance']} class={m['class']} "
          f"contours={m['contours']} gpos={len(m['gpos_lookups'])}  (model)")

    healthy = g["advance"] == 0 and g["class"] == MARK_CLASS and g["gpos_lookups"]
    if args.verify:
        print("\nVERDICT:", "already correct" if healthy else "BROKEN — run without --verify")
        return 0 if healthy else 1
    if healthy:
        print("\nAlready patched; nothing to do.")
        return 0

    stamp = time.strftime("%Y%m%d-%H%M%S")
    for f in (TTF, WOFF2):
        if f.exists():
            backup = f.with_suffix(f.suffix + f".orig-{stamp}")
            shutil.copy2(f, backup)
            print(f"  backed up {f.name} -> {backup.name}")

    print("\npatching:")
    patch(font)
    font.save(TTF)

    # Re-open from disk so the woff2 is built from the compiled result, which
    # also proves the coverage/record pairing survived a compile round-trip.
    reloaded = TTFont(TTF)
    reloaded.flavor = "woff2"
    reloaded.save(WOFF2)

    after = describe(TTFont(TTF))[BROKEN]
    print(f"\nafter: advance={after['advance']} class={after['class']} "
          f"contours={after['contours']} gpos={len(after['gpos_lookups'])}")
    ok = after["advance"] == 0 and after["class"] == MARK_CLASS and after["gpos_lookups"]
    print("VERDICT:", "repaired" if ok else "STILL BROKEN")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
