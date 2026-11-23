#!/usr/bin/env python3
"""
Convert exported exam papers / mark schemes / question banks into compact
"annotated text" (doc.md) that keeps the formatting signals a question
extractor needs (bold, underline, colour, highlight, list structure, images).

Inputs (all in one source directory):
  <name>.html.zip     Google Docs "web page" export (authoritative)
  <name>.docx         Word file (used when there is no .html.zip)
  forms/*.form.json   raw Google Forms API `forms.get` responses
  <name>.txt          plain-text export, only used by --verify as a cross-check
  *.pdf               ignored

Output:
  OUT/<slug>/doc.md, OUT/<slug>/images/<file>, OUT/index.json

Annotated-text conventions (doc.md):
  # / ## ...             headings (h1..h6, docx Heading/Title styles)
  **x**                  bold (suppressed inside headings, where it is the style default)
  __x__                  underline (link underline is not marked)
  {color:#rrggbb}x{/color}  non-black text colour (near-black greys are treated as black)
  {hl:#rrggbb}x{/hl}        background / highlight colour (white/transparent ignored)
  "  " * level + "- " / "1. " / "(a) "  list items, marker text from the doc's own
                         list CSS (Google) or numbering.xml (Word); a non-standard
                         bullet glyph is kept as "- [glyph:X] "
  [IMG: images/f WxH]    an image, in reading order, pixel size read from the file
  [ ] / [x]              added in front of an image that is a small square checkbox
                         picture, by looking at its pixels (empty vs ticked)
  [frame:#rrggbb]        an answer frame (Google HTML only). Before an [IMG]: that picture
                         has a coloured CSS border. At the start of a line: a frame picture
                         (an empty coloured square, usually stretched over an option) is
                         anchored on that line, i.e. that option is framed. A frame picture
                         alone on its line is written "[frame:#rrggbb option unknown: ...]":
                         it floats, and the export does not say which option it covers.
  | a | b |              tables (cells' paragraphs joined with " <br> ")
  [text](url)            hyperlinks

Standard library only. Source files are untrusted data; run with `python3 -I`.

Usage:
  python3 -I execution/exam_doc_to_text.py SRC_DIR OUT_DIR
  python3 -I execution/exam_doc_to_text.py SRC_DIR OUT_DIR --verify   # also diff vs .txt
"""

from __future__ import annotations

import html
import json
import os
import re
import struct
import sys
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile
import zlib
from html.parser import HTMLParser

# --------------------------------------------------------------------------
# image helpers
# --------------------------------------------------------------------------


def image_size(data: bytes):
    """(w, h) from PNG / JPEG / GIF / BMP / WEBP headers, or None."""
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", data[6:10])
    if data[:2] == b"BM" and len(data) >= 26:
        w, h = struct.unpack("<ii", data[18:26])
        return w, abs(h)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X":
            w = 1 + int.from_bytes(data[24:27], "little")
            h = 1 + int.from_bytes(data[27:30], "little")
            return w, h
        if chunk == b"VP8 ":
            w, h = struct.unpack("<HH", data[26:30])
            return w & 0x3FFF, h & 0x3FFF
        if chunk == b"VP8L":
            b = data[21:25]
            w = 1 + (((b[1] & 0x3F) << 8) | b[0])
            h = 1 + (((b[3] & 0xF) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
            return w, h
    if data[:2] == b"\xff\xd8":
        i = 2
        n = len(data)
        while i + 9 < n:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            if marker == 0xFF:
                i += 1
                continue
            seglen = struct.unpack(">H", data[i + 2 : i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                return w, h
            i += 2 + seglen
    return None


def _png_pixels(data: bytes):
    """Decode a non-interlaced 8-bit PNG to (w, h, rows of (lum, alpha)). None if unsupported."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    pos = 8
    idat = b""
    w = h = depth = ctype = interlace = None
    palette = None
    trns = None
    while pos + 8 <= len(data):
        ln = struct.unpack(">I", data[pos : pos + 4])[0]
        typ = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif typ == b"PLTE":
            palette = [tuple(body[i : i + 3]) for i in range(0, len(body), 3)]
        elif typ == b"tRNS":
            trns = body
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    if w is None or interlace or w * h > 200_000:
        return None
    if ctype == 3 and depth in (1, 2, 4, 8):
        bpp_bits = depth
    elif depth == 8 and ctype in (0, 2, 4, 6):
        bpp_bits = 8 * {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    else:
        return None
    try:
        raw = zlib.decompress(idat)
    except zlib.error:
        return None
    stride = (w * bpp_bits + 7) // 8
    bpp = max(1, bpp_bits // 8)
    rows = []
    prev = bytearray(stride)
    p = 0
    for _ in range(h):
        ft = raw[p]
        line = bytearray(raw[p + 1 : p + 1 + stride])
        p += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ft == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ft == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ft == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 0xFF
            elif ft == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        prev = line
        px = []
        for x in range(w):
            if ctype == 3:
                bit = x * depth
                idx = (line[bit // 8] >> (8 - depth - bit % 8)) & ((1 << depth) - 1)
                r, g, bb = palette[idx] if palette and idx < len(palette) else (0, 0, 0)
                al = trns[idx] if trns and idx < len(trns) else 255
            elif ctype == 0:
                r = g = bb = line[x]
                al = 255
            elif ctype == 4:
                r = g = bb = line[2 * x]
                al = line[2 * x + 1]
            elif ctype == 2:
                r, g, bb = line[3 * x : 3 * x + 3]
                al = 255
            else:
                r, g, bb, al = line[4 * x : 4 * x + 4]
            px.append(((r * 299 + g * 587 + bb * 114) // 1000, al, r, g, bb))
        rows.append(px)
    return w, h, rows


def checkbox_state(data: bytes):
    """Marker for a small square box picture (a checkbox, or a coloured frame drawn
    around an answer), decided from its pixels; None if the image is not a box.
      black/grey outline: "[ ]" empty, "[x]" ticked/filled
      coloured outline:   "[box:#rrggbb]" empty, "[x box:#rrggbb]" ticked/filled"""
    size = image_size(data)
    if not size:
        return None
    w, h = size
    if not (8 <= w <= 64 and 8 <= h <= 64) or abs(w - h) > 0.15 * max(w, h):
        return None
    dec = _png_pixels(data)
    if not dec:
        return None
    w, h, rows = dec

    def dark(v):
        return v[1] > 128 and v[0] < 160

    band_x, band_y = max(1, w // 5), max(1, h // 5)

    def line_dark(cells):
        return sum(1 for v in cells if dark(v)) / max(1, len(cells))

    top = max(line_dark(rows[y]) for y in range(band_y))
    bottom = max(line_dark(rows[y]) for y in range(h - band_y, h))
    left = max(line_dark([rows[y][x] for y in range(h)]) for x in range(band_x))
    right = max(line_dark([rows[y][x] for y in range(h)]) for x in range(w - band_x, w))
    if min(top, bottom, left, right) < 0.6:
        return None  # no box outline -> not a checkbox
    x0, x1, y0, y1 = int(w * 0.3), int(w * 0.7), int(h * 0.3), int(h * 0.7)
    inner = [rows[y][x] for y in range(y0, y1) for x in range(x0, x1)]
    frac = sum(1 for v in inner if dark(v)) / max(1, len(inner))
    ticked = frac > 0.08
    edge = [rows[y][x] for y in range(h) for x in range(w)
            if (x < band_x or x >= w - band_x or y < band_y or y >= h - band_y) and dark(rows[y][x])]
    r = sum(v[2] for v in edge) // max(1, len(edge))
    g = sum(v[3] for v in edge) // max(1, len(edge))
    b = sum(v[4] for v in edge) // max(1, len(edge))
    if max(r, g, b) - min(r, g, b) > 80:
        col = "#%02x%02x%02x" % (r, g, b)
        return f"[x box:{col}]" if ticked else f"[box:{col}]"
    return "[x]" if ticked else "[ ]"


# --------------------------------------------------------------------------
# colour / text helpers
# --------------------------------------------------------------------------

NAMED = {"black": "#000000", "white": "#ffffff", "red": "#ff0000", "yellow": "#ffff00",
         "green": "#008000", "lime": "#00ff00", "blue": "#0000ff", "cyan": "#00ffff",
         "magenta": "#ff00ff", "gray": "#808080", "grey": "#808080"}


def norm_color(v):
    """Normalise a CSS colour to #rrggbb, or None for transparent/unknown."""
    if not v:
        return None
    v = v.strip().lower().replace("!important", "").strip()
    if v in ("transparent", "inherit", "initial", "none", "auto", "unset"):
        return None
    if v in NAMED:
        return NAMED[v]
    m = re.fullmatch(r"#([0-9a-f]{3})", v)
    if m:
        return "#" + "".join(c * 2 for c in m.group(1))
    m = re.fullmatch(r"#?([0-9a-f]{6})", v)
    if m:
        return "#" + m.group(1)
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)", v)
    if m:
        if m.group(4) is not None and float(m.group(4)) == 0:
            return None
        return "#%02x%02x%02x" % tuple(min(255, int(m.group(i))) for i in (1, 2, 3))
    return None


def _rgb(c):
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def is_default_text(c):
    """Black or near-black grey/navy (#0a0a0a, #202124, #08081a) is the default."""
    if c is None:
        return True
    return max(_rgb(c)) <= 0x40


def is_default_bg(c):
    if c is None:
        return True
    return min(_rgb(c)) >= 0xF8


WS_RUN = re.compile(r"[ \t    　]+")


WS_CHARS = " \t\n    　"


def squash(s: str) -> str:
    return WS_RUN.sub(" ", s)


def esc(s: str) -> str:
    """Escape literal text that would read as a marker: every '*', and an
    underscore pair '__' (single underscores and runs of 3+, e.g. answer blanks, stay)."""
    s = s.replace("\\", "\\\\").replace("*", "\\*")
    return re.sub(r"(?<!_)__(?!_)", r"\\_\\_", s)


# --------------------------------------------------------------------------
# inline run model + marker emission (shared by HTML and DOCX)
# --------------------------------------------------------------------------
# A run is (text, attrs) where attrs = (hl, color, bold, underline); an image
# token is ("\x00IMG<n>\x00", attrs) and is treated as non-whitespace text.

ATTR_ORDER = ("hl", "color", "bold", "u")
DEFAULT_ATTRS = (None, None, False, False)


def _open(i, v):
    return ("{hl:%s}" % v, "{color:%s}" % v, "**", "__")[i]


def _close(i, v):
    return ("{/hl}", "{/color}", "**", "__")[i]


def render_runs(runs):
    """Merge runs, smooth whitespace attrs and emit nested, collapsed markers."""
    runs = [(t, a) for t, a in runs if t]
    if not runs:
        return ""
    # merge equal-attr neighbours
    merged = []
    for t, a in runs:
        if merged and merged[-1][1] == a:
            merged[-1] = (merged[-1][0] + t, a)
        else:
            merged.append((t, a))
    # whitespace-only runs take an attr only if both neighbours share it
    out = []
    for i, (t, a) in enumerate(merged):
        if t.strip() == "":
            prev = next((merged[j][1] for j in range(i - 1, -1, -1) if merged[j][0].strip()), DEFAULT_ATTRS)
            nxt = next((merged[j][1] for j in range(i + 1, len(merged)) if merged[j][0].strip()), DEFAULT_ATTRS)
            a = tuple(p if p == n else d for p, n, d in zip(prev, nxt, DEFAULT_ATTRS))
        out.append((t, a))
    merged = []
    for t, a in out:
        if merged and merged[-1][1] == a:
            merged[-1] = (merged[-1][0] + t, a)
        else:
            merged.append((t, a))

    buf = []
    stack = []  # list of (attr_index, value), outermost first, in ATTR_ORDER
    pending_ws = ""
    for t, a in merged:
        core = t.strip(WS_CHARS)
        if not core:
            pending_ws += t
            continue
        lead = t[: len(t) - len(t.lstrip(WS_CHARS))]
        trail = t[len(t.rstrip(WS_CHARS)) :]
        want = [(i, a[i]) for i in range(4) if a[i] not in (None, False)]
        k = 0
        while k < len(stack) and k < len(want) and stack[k] == want[k]:
            k += 1
        for i, v in reversed(stack[k:]):
            buf.append(_close(i, v))
        stack = stack[:k]
        buf.append(pending_ws + lead)
        pending_ws = ""
        for i, v in want[k:]:
            buf.append(_open(i, v))
            stack.append((i, v))
        buf.append(core)
        pending_ws = trail
    for i, v in reversed(stack):
        buf.append(_close(i, v))
    buf.append(pending_ws)
    return "".join(buf)


def finish_inline(text: str, images: list) -> str:
    text = squash(text)
    text = re.sub(r" *\n *", "\n", text)
    text = text.strip(" \n")

    def sub(m):
        return images[int(m.group(1))]

    return place_frames(re.sub(r"\x00IMG(\d+)\x00", sub, text))


# A frame picture's image token, replaced by place_frames once the line is known.
FRAME_PIC = re.compile(r"\x01FRAME (#[0-9a-f]{6}) (\S+)\x01")
EMPTY_MARKS = re.compile(r"\{/?(?:hl|color)(?::#[0-9a-f]{6})?\}|(?<!\\)\*\*|(?<![_\\])__(?!_)")


def place_frames(text: str) -> str:
    """A frame picture floats over an option, and the export only keeps the line it is
    anchored on: put "[frame:#c]" at the front of that line, or, when the frame is alone
    on its line, say the option is unknown instead of guessing."""
    if "\x01FRAME" not in text:
        return text
    out = []
    for ln in text.split("\n"):
        frames = FRAME_PIC.findall(ln)
        if not frames:
            out.append(ln)
            continue
        rest = squash(FRAME_PIC.sub("", ln)).strip()
        if EMPTY_MARKS.sub("", rest).strip():
            out.append(" ".join(f"[frame:{c}]" for c, _ in frames) + " " + rest)
        else:
            out.append(" ".join(
                f"[frame:{c} option unknown: the frame picture {p} is on a line of its own;"
                " the export does not say which option it was drawn over]" for c, p in frames))
    return "\n".join(out)


BORDER_STYLES = ("solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset")


def css_border(st: dict):
    """Colour of a visible `border` shorthand in a style dict, else None.
    Google writes `border: 0.00px solid #000000` on every image wrapper; only a
    non-zero width counts."""
    v = (st.get("border") or "").lower()
    if not v:
        return None
    w = re.search(r"(?<![\w#.])(\d*\.?\d+)(?:px|pt)?(?![\w.])", v)
    width = float(w.group(1)) if w else 1.0
    if width <= 0.1 or not any(re.search(rf"\b{s}\b", v) for s in BORDER_STYLES):
        return None
    m = re.search(r"#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)|\b(?:%s)\b" % "|".join(NAMED), v)
    return norm_color(m.group(0)) if m else "#000000"


# --------------------------------------------------------------------------
# Google Docs HTML
# --------------------------------------------------------------------------


class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent=None):
        self.tag = tag
        self.attrs = attrs
        self.children = []
        self.parent = parent


VOID = {"img", "br", "hr", "meta", "link", "input", "col", "area", "base", "wbr", "source"}


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {})
        self.cur = self.root
        self.style_text = []
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        if tag == "style":
            self._in_style = True
            return
        n = Node(tag, dict(attrs), self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        n = Node(tag, dict(attrs), self.cur)
        self.cur.children.append(n)

    def handle_endtag(self, tag):
        if tag == "style":
            self._in_style = False
            return
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        if self._in_style:
            self.style_text.append(data)
            return
        self.cur.children.append(data)


def parse_decls(s: str) -> dict:
    d = {}
    for part in (s or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            d[k.strip().lower()] = v.strip()
    return d


class CSS:
    """Resolve Google Docs class/element rules plus inline style."""

    def __init__(self, text: str):
        self.cls = {}      # class -> decls
        self.elem = {}     # tag -> decls
        self.list_content = {}  # "lst-kix_x-L" -> content string (raw CSS)
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        text = re.sub(r"@import[^;]*;", "", text)
        for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", text):
            decls = parse_decls(body)
            for s in sel.split(","):
                s = s.strip()
                m = re.fullmatch(r"\.(lst-kix_[\w-]+-\d+)\s*>\s*li:before", s)
                if m and "content" in decls:
                    self.list_content[m.group(1)] = decls["content"]
                    continue
                m = re.fullmatch(r"\.([\w-]+)", s)
                if m:
                    self.cls.setdefault(m.group(1), {}).update(decls)
                    continue
                m = re.fullmatch(r"([a-z][a-z0-9]*)", s)
                if m:
                    self.elem.setdefault(m.group(1), {}).update(decls)

    def style_of(self, node: Node) -> dict:
        d = dict(self.elem.get(node.tag, {}))
        for c in (node.attrs.get("class") or "").split():
            d.update(self.cls.get(c, {}))
        d.update(parse_decls(node.attrs.get("style", "")))
        return d


def css_counter(n: int, style: str) -> str:
    style = (style or "decimal").strip()
    if style in ("lower-latin", "lower-alpha", "upper-latin", "upper-alpha"):
        s = ""
        while n > 0:
            n, r = divmod(n - 1, 26)
            s = chr(97 + r) + s
        return s.upper() if style.startswith("upper") else s
    if style in ("lower-roman", "upper-roman"):
        vals = [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"),
                (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
        s = ""
        for v, sym in vals:
            while n >= v:
                s += sym
                n -= v
        return s.upper() if style.startswith("upper") else s
    if style == "decimal-leading-zero":
        return "%02d" % n
    return str(n)


def css_unescape(s: str) -> str:
    def rep(m):
        return chr(int(m.group(1), 16))

    return re.sub(r"\\([0-9a-fA-F]{1,6}) ?", rep, s)


STD_BULLETS = {"●", "○", "■", "•", "◦", "▪", "o", "", "-", "–", "◆", "▫", "□"}


class HtmlConverter:
    def __init__(self, html_text: str, image_bytes: dict):
        tb = TreeBuilder()
        tb.feed(html_text)
        tb.close()
        self.root = tb.root
        self.css = CSS("".join(tb.style_text))
        self.image_bytes = image_bytes  # "images/x.png" -> bytes
        self.used_images = []
        self.counters = {}  # (listid, level) -> int
        self.lines = []

    # ----- style computation
    def computed(self, node: Node, inherited: dict) -> dict:
        st = self.css.style_of(node) if isinstance(node, Node) else {}
        c = dict(inherited)
        if node.tag in ("b", "strong"):
            c["bold"] = True
        if node.tag == "u":
            c["u"] = True
        if "font-weight" in st:
            fw = st["font-weight"]
            c["bold"] = fw == "bold" or fw == "bolder" or (fw.isdigit() and int(fw) >= 600)
        td = st.get("text-decoration") or st.get("text-decoration-line")
        if td is not None:
            c["u"] = "underline" in td
        if "color" in st:
            c["color"] = norm_color(st["color"])
        bg = st.get("background-color") or (st.get("background") if st.get("background", "").startswith(("#", "rgb")) else None)
        if bg is not None and node.tag not in ("body", "html"):
            c["hl"] = norm_color(bg)
        if "display" in st and st["display"].strip() == "none":
            c["hidden"] = True
        if node.tag == "a" and node.attrs.get("href"):
            c["link"] = True
        return c

    @staticmethod
    def attrs_tuple(c: dict, in_heading=False):
        hl = c.get("hl")
        hl = None if is_default_bg(hl) else hl
        col = c.get("color")
        link = c.get("link")
        if is_default_text(col) or (link and col in ("#1155cc", "#0000ee", "#0563c1")):
            col = None
        bold = bool(c.get("bold")) and not in_heading
        u = bool(c.get("u")) and not link
        return (hl, col, bold, u)

    # ----- images
    def image_token(self, node: Node, images: list) -> str:
        src = node.attrs.get("src", "")
        key = src.split("?")[0]
        data = self.image_bytes.get(key)
        fname = key.split("/")[-1] if key else "?"
        if data is None:
            s = f"[IMG: missing {src}]"
        else:
            sz = image_size(data)
            dims = f"{sz[0]}x{sz[1]}" if sz else "?x?"
            # a picture displayed with a different aspect ratio than its file (e.g. a
            # 55x55 red square stretched into a frame around an answer) keeps its shown size
            st = parse_decls(node.attrs.get("style", ""))
            try:
                sw = float(st.get("width", "").replace("px", ""))
                sh = float(st.get("height", "").replace("px", ""))
            except ValueError:
                sw = sh = 0
            if sz and sw > 0 and sh > 0 and sz[1] and abs((sw / sh) / (sz[0] / sz[1]) - 1) > 0.25:
                dims += f" shown={round(sw)}x{round(sh)}"
            alt = squash((node.attrs.get("alt") or "").replace("\n", " ")).strip().replace("]", ")")
            alt = f' alt="{alt}"' if alt else ""
            s = f"[IMG: images/{fname} {dims}{alt}]"
            cb = checkbox_state(data)
            if cb and cb.startswith("[box:"):
                # an empty coloured square: a frame picture laid over an answer, not a
                # checkbox; place_frames attaches it to the line it is anchored on
                s = f"\x01FRAME {cb[5:-1]} images/{fname}\x01"
            elif cb:
                s = f"{cb} {s}"
            # a coloured border set on the picture itself (Docs: Image options > border),
            # written on the <span> Google wraps every picture in
            wrap = node.parent if isinstance(node.parent, Node) and node.parent.tag == "span" else None
            bcol = css_border(self.css.style_of(node)) or (css_border(self.css.style_of(wrap)) if wrap else None)
            if bcol and not s.startswith("\x01"):
                s = f"[frame:{bcol}] {s}"
            if fname not in self.used_images:
                self.used_images.append(fname)
        images.append(s)
        return f"\x00IMG{len(images) - 1}\x00"

    # ----- inline collection
    def collect_inline(self, node, inherited, runs, images, in_heading, blocks_out=None):
        """Collect runs from node's children. Nested block lists inside cells are flattened."""
        for ch in node.children:
            if isinstance(ch, str):
                t = esc(ch.replace("\r", " ").replace("\n", " "))
                runs.append((t, self.attrs_tuple(inherited, in_heading)))
                continue
            c = self.computed(ch, inherited)
            if c.get("hidden"):
                continue
            if ch.tag == "img":
                runs.append((self.image_token(ch, images), self.attrs_tuple(c, in_heading)))
            elif ch.tag == "br":
                runs.append(("\n", DEFAULT_ATTRS))
            elif ch.tag in ("script", "style", "head", "title", "meta"):
                continue
            elif ch.tag == "a" and ch.attrs.get("href"):
                href = ch.attrs["href"]
                sub = []
                self.collect_inline(ch, c, sub, images, in_heading)
                text_only = "".join(t for t, _ in sub).strip()
                url = self.clean_href(href)
                if url and text_only and url != text_only and not href.startswith("#"):
                    runs.append(("[", DEFAULT_ATTRS))
                    runs.extend(sub)
                    runs.append((f"]({url})", DEFAULT_ATTRS))
                else:
                    runs.extend(sub)
            elif ch.tag in ("p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "ul", "ol", "table"):
                # block inside inline context (e.g. table cell): separate with a line break
                if runs and runs[-1][0] != "\n":
                    runs.append(("\n", DEFAULT_ATTRS))
                if ch.tag == "li":
                    runs.append((self.list_marker(ch).lstrip(), DEFAULT_ATTRS))
                self.collect_inline(ch, c, runs, images, in_heading or ch.tag[:1] == "h" and ch.tag[1:].isdigit())
            else:
                self.collect_inline(ch, c, runs, images, in_heading)

    @staticmethod
    def clean_href(href: str) -> str:
        if href.startswith("https://www.google.com/url?"):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("q")
            if q:
                return q[0]
        return href

    # ----- lists
    def list_info(self, li: Node):
        lst = li.parent
        while lst is not None and lst.tag not in ("ul", "ol"):
            lst = lst.parent
        if lst is None:
            return None, 0, "ul"
        lid, level = None, 0
        for c in (lst.attrs.get("class") or "").split():
            m = re.fullmatch(r"(lst-kix_[\w]+)-(\d+)", c)
            if m:
                lid, level = m.group(1), int(m.group(2))
        if lid is None:
            # plain HTML nesting
            d = 0
            p = lst.parent
            while p is not None:
                if p.tag in ("ul", "ol"):
                    d += 1
                p = p.parent
            level = d
        return (lid, lst), level, lst.tag

    def list_marker(self, li: Node) -> str:
        (lid, lst), level, kind = self.list_info(li)
        indent = "  " * level
        key = (lid or id(lst), level)
        content = self.css.list_content.get(f"{lid}-{level}") if lid else None
        if kind == "ol" or (content and "counter(" in content):
            n = self.counters.get(key, 0) + 1
            self.counters[key] = n
            if content:
                parts = re.findall(r'"((?:[^"\\]|\\.)*)"|counter\(\s*([\w-]+)\s*(?:,\s*([\w-]+))?\s*\)', content)
                s = ""
                for lit, cname, cstyle in parts:
                    if cname:
                        m = re.search(r"kix_[\w]+-(\d+)$", cname)
                        lvl = int(m.group(1)) if m else level
                        val = self.counters.get((key[0], lvl), 0) if lvl != level else n
                        s += css_counter(val, cstyle)
                    else:
                        s += css_unescape(lit)
                s = squash(s).strip()
                return f"{indent}{s} "
            return f"{indent}{n}. "
        glyph = squash(css_unescape(content.strip('"'))).strip() if content else "●"
        if glyph in STD_BULLETS:
            return f"{indent}- "
        return f"{indent}- [glyph:{glyph}] "

    def note_list_start(self, lst: Node):
        lid, level = None, 0
        for c in (lst.attrs.get("class") or "").split():
            m = re.fullmatch(r"(lst-kix_[\w]+)-(\d+)", c)
            if m:
                lid, level = m.group(1), int(m.group(2))
        if lid is None:
            return
        start = lst.attrs.get("start")
        classes = (lst.attrs.get("class") or "").split()
        if start and start.lstrip("-").isdigit():
            self.counters[(lid, level)] = int(start) - 1
        elif "start" in classes:
            self.counters[(lid, level)] = 0

    # ----- block walk
    def emit(self, line: str):
        self.lines.append(line)

    def block(self, node: Node, inherited: dict):
        for ch in node.children:
            if isinstance(ch, str):
                if ch.strip():
                    self.emit(finish_inline(render_runs([(esc(ch), self.attrs_tuple(inherited))]), []))
                continue
            c = self.computed(ch, inherited)
            if c.get("hidden"):
                continue
            tag = ch.tag
            if tag in ("head", "script", "style", "title", "meta"):
                continue
            if tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6"):
                heading = tag[0] == "h"
                runs, images = [], []
                self.collect_inline(ch, c, runs, images, heading)
                text = finish_inline(render_runs(runs), images)
                cls = (ch.attrs.get("class") or "").split()
                if text and "title" in cls:
                    heading, tag = True, "h1"
                if not text:
                    self.emit("")
                elif heading:
                    self.emit("#" * int(tag[1]) + " " + text.replace("\n", " "))
                else:
                    self.emit(text)
            elif tag in ("ul", "ol"):
                self.note_list_start(ch)
                for li in ch.children:
                    if isinstance(li, Node) and li.tag == "li":
                        lc = self.computed(li, c)
                        marker = self.list_marker(li)
                        runs, images = [], []
                        self.collect_inline(li, lc, runs, images, False)
                        text = finish_inline(render_runs(runs), images)
                        pad = " " * len(marker)
                        self.emit(marker + text.replace("\n", "\n" + pad))
                    elif isinstance(li, Node):
                        self.block(li, c)
            elif tag == "table":
                self.table(ch, c)
            elif tag == "hr":
                st = self.css.style_of(ch)
                if "page-break" not in " ".join(st.keys()):
                    self.emit("---")
            elif tag == "br":
                self.emit("")
            elif tag == "img":
                images = []
                tok = self.image_token(ch, images)
                self.emit(finish_inline(tok, images))
            else:
                self.block(ch, c)

    def table(self, tbl: Node, inherited: dict):
        rows = []

        def walk(n, inh):
            for ch in n.children:
                if not isinstance(ch, Node):
                    continue
                c = self.computed(ch, inh)
                if ch.tag == "tr":
                    cells = []
                    for td in ch.children:
                        if isinstance(td, Node) and td.tag in ("td", "th"):
                            tc = self.computed(td, c)
                            runs, images = [], []
                            self.collect_inline(td, tc, runs, images, False)
                            text = finish_inline(render_runs(runs), images)
                            text = re.sub(r"\n+", " <br> ", text).replace("|", "\\|")
                            span = int(td.attrs.get("colspan", "1") or 1)
                            cells.append(text)
                            cells.extend([""] * (span - 1))
                    rows.append(cells)
                elif ch.tag in ("tbody", "thead", "tfoot"):
                    walk(ch, c)

        walk(tbl, inherited)
        if not rows:
            return
        width = max(len(r) for r in rows)
        self.emit("")
        for i, r in enumerate(rows):
            r = r + [""] * (width - len(r))
            self.emit("| " + " | ".join(r) + " |")
            if i == 0:
                self.emit("|" + "---|" * width)
        self.emit("")

    def convert(self) -> str:
        body = self.find(self.root, "body") or self.root
        base = {"bold": False, "u": False, "color": None, "hl": None}
        self.block(body, self.computed(body, base) if body is not self.root else base)
        return tidy(self.lines)

    @staticmethod
    def find(n, tag):
        for ch in n.children:
            if isinstance(ch, Node):
                if ch.tag == tag:
                    return ch
                r = HtmlConverter.find(ch, tag)
                if r:
                    return r
        return None


def tidy(lines) -> str:
    out = []
    blank = False
    for ln in "\n".join(lines).split("\n"):
        ln = ln.rstrip()
        if not ln.strip():
            if out and not blank:
                out.append("")
            blank = True
            continue
        blank = False
        out.append(ln)
    while out and not out[-1]:
        out.pop()
    return "\n".join(out) + "\n"


def convert_html_zip(path: str, out_dir: str):
    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    htmls = [n for n in names if n.lower().endswith((".html", ".htm")) and "/" not in n.strip("/")]
    if not htmls:
        htmls = [n for n in names if n.lower().endswith((".html", ".htm"))]
    if not htmls:
        raise ValueError("no html file in zip")
    raw = zf.read(htmls[0]).decode("utf-8", errors="strict")
    image_bytes = {}
    for n in names:
        if n.startswith("images/") and not n.endswith("/") and ".." not in n:
            image_bytes[n] = zf.read(n)
    conv = HtmlConverter(raw, image_bytes)
    md = conv.convert()
    img_dir = os.path.join(out_dir, "images")
    os.makedirs(img_dir, exist_ok=True)
    written = 0
    for n, data in image_bytes.items():
        fname = os.path.basename(n)
        if not fname:
            continue
        with open(os.path.join(img_dir, fname), "wb") as f:
            f.write(data)
        written += 1
    unused = sorted(set(os.path.basename(n) for n in image_bytes) - set(conv.used_images))
    return md, written, unused


# --------------------------------------------------------------------------
# DOCX
# --------------------------------------------------------------------------

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
V = "urn:schemas-microsoft-com:vml"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"


def wq(tag):
    return "{%s}%s" % (W, tag)


HIGHLIGHT = {"yellow": "#ffff00", "green": "#00ff00", "cyan": "#00ffff", "magenta": "#ff00ff",
             "blue": "#0000ff", "red": "#ff0000", "darkBlue": "#000080", "darkCyan": "#008080",
             "darkGreen": "#008000", "darkMagenta": "#800080", "darkRed": "#800000",
             "darkYellow": "#808000", "darkGray": "#808080", "lightGray": "#c0c0c0",
             "black": "#000000", "white": None, "none": None}

PUA_BULLETS = {"": "•", "": "▪", "": "➢", "": "❖", "": "✓",
               "": "☒", "": "☐", "": "☐", "": "■", "": "❑",
               "": "➢"}


def _onoff(el):
    if el is None:
        return None
    v = el.get(wq("val"))
    return v not in ("0", "false", "off")


class DocxConverter:
    def __init__(self, zf: zipfile.ZipFile):
        self.zf = zf
        self.doc = ET.fromstring(zf.read("word/document.xml"))
        self.rels = {}
        try:
            for r in ET.fromstring(zf.read("word/_rels/document.xml.rels")):
                self.rels[r.get("Id")] = r.get("Target")
        except KeyError:
            pass
        self.styles = {}
        self.default_rpr = {}
        try:
            st = ET.fromstring(zf.read("word/styles.xml"))
            d = st.find(f"{wq('docDefaults')}/{wq('rPrDefault')}/{wq('rPr')}")
            if d is not None:
                self.default_rpr = self.rpr(d, {})
            for s in st.findall(wq("style")):
                sid = s.get(wq("styleId"))
                name_el = s.find(wq("name"))
                based = s.find(wq("basedOn"))
                rp = s.find(wq("rPr"))
                self.styles[sid] = {
                    "name": name_el.get(wq("val")) if name_el is not None else sid,
                    "based": based.get(wq("val")) if based is not None else None,
                    "rpr": rp,
                    "type": s.get(wq("type")),
                }
        except KeyError:
            pass
        self.nums = {}  # numId -> (abstract lvls dict, overrides)
        try:
            nx = ET.fromstring(zf.read("word/numbering.xml"))
            absn = {}
            for an in nx.findall(wq("abstractNum")):
                lvls = {}
                for lvl in an.findall(wq("lvl")):
                    il = int(lvl.get(wq("ilvl")))
                    fmt = lvl.find(wq("numFmt"))
                    txt = lvl.find(wq("lvlText"))
                    start = lvl.find(wq("start"))
                    lvls[il] = {
                        "fmt": fmt.get(wq("val")) if fmt is not None else "decimal",
                        "text": txt.get(wq("val")) if txt is not None else "",
                        "start": int(start.get(wq("val"))) if start is not None else 1,
                    }
                absn[an.get(wq("abstractNumId"))] = lvls
            for num in nx.findall(wq("num")):
                aid = num.find(wq("abstractNumId")).get(wq("val"))
                ov = {}
                for lo in num.findall(wq("lvlOverride")):
                    so = lo.find(wq("startOverride"))
                    if so is not None:
                        ov[int(lo.get(wq("ilvl")))] = int(so.get(wq("val")))
                self.nums[num.get(wq("numId"))] = (absn.get(aid, {}), ov)
        except KeyError:
            pass
        self.counters = {}
        self.used_images = []
        self.lines = []

    def style_chain_rpr(self, sid, acc):
        seen = set()
        chain = []
        while sid and sid in self.styles and sid not in seen:
            seen.add(sid)
            chain.append(self.styles[sid])
            sid = self.styles[sid]["based"]
        for s in reversed(chain):
            if s["rpr"] is not None:
                acc = self.rpr(s["rpr"], acc)
        return acc

    def rpr(self, el, base):
        c = dict(base)
        if el is None:
            return c
        rs = el.find(wq("rStyle"))
        if rs is not None:
            c = self.style_chain_rpr(rs.get(wq("val")), c)
        b = _onoff(el.find(wq("b")))
        if b is not None:
            c["bold"] = b
        u = el.find(wq("u"))
        if u is not None:
            c["u"] = u.get(wq("val"), "single") not in ("none", "0")
        col = el.find(wq("color"))
        if col is not None:
            v = col.get(wq("val"))
            c["color"] = None if v in (None, "auto") else norm_color("#" + v)
        hl = el.find(wq("highlight"))
        shd = el.find(wq("shd"))
        if shd is not None:
            fill = shd.get(wq("fill"))
            c["hl"] = None if fill in (None, "auto") else norm_color("#" + fill)
        if hl is not None:
            c["hl"] = HIGHLIGHT.get(hl.get(wq("val")), None)
        vanish = _onoff(el.find(wq("vanish")))
        if vanish is not None:
            c["hidden"] = vanish
        return c

    def para_style(self, p):
        ppr = p.find(wq("pPr"))
        sid = None
        if ppr is not None:
            ps = ppr.find(wq("pStyle"))
            if ps is not None:
                sid = ps.get(wq("val"))
        return ppr, sid

    def heading_level(self, sid):
        if not sid:
            return 0
        name = (self.styles.get(sid, {}).get("name") or sid).lower().replace(" ", "")
        if name == "title":
            return 1
        m = re.fullmatch(r"heading(\d)", name)
        return int(m.group(1)) if m else 0

    def image_token(self, rid, images, alt=""):
        target = self.rels.get(rid)
        if not target:
            images.append(f"[IMG: missing rel {rid}]")
            return f"\x00IMG{len(images) - 1}\x00"
        path = os.path.normpath(os.path.join("word", target)).replace(os.sep, "/")
        try:
            data = self.zf.read(path)
        except KeyError:
            images.append(f"[IMG: missing {target}]")
            return f"\x00IMG{len(images) - 1}\x00"
        fname = os.path.basename(path)
        sz = image_size(data)
        dims = f"{sz[0]}x{sz[1]}" if sz else "?x?"
        alt = squash((alt or "").replace("\n", " ")).strip().replace("]", ")")
        alt = f' alt="{alt}"' if alt else ""
        s = f"[IMG: images/{fname} {dims}{alt}]"
        cb = checkbox_state(data)
        if cb:
            s = f"{cb} {s}"
        if fname not in self.used_images:
            self.used_images.append(fname)
        images.append(s)
        return f"\x00IMG{len(images) - 1}\x00"

    def runs_of(self, container, pbase, runs, images, in_heading):
        for el in container:
            tag = el.tag
            if tag == wq("r"):
                c = self.rpr(el.find(wq("rPr")), pbase)
                if c.get("hidden"):
                    continue
                at = (c.get("hl") if not is_default_bg(c.get("hl")) else None,
                      c.get("color") if not is_default_text(c.get("color")) else None,
                      bool(c.get("bold")) and not in_heading, bool(c.get("u")))
                for ch in el:
                    t = ch.tag
                    if t == wq("t"):
                        runs.append((esc((ch.text or "").replace("\n", " ")), at))
                    elif t == wq("tab"):
                        runs.append((" ", at))
                    elif t in (wq("br"), wq("cr")):
                        if ch.get(wq("type")) != "page":
                            runs.append(("\n", DEFAULT_ATTRS))
                    elif t == wq("noBreakHyphen"):
                        runs.append(("-", at))
                    elif t == wq("sym"):
                        code = ch.get(wq("char"))
                        if code:
                            chh = chr(int(code, 16))
                            runs.append((PUA_BULLETS.get(chh, chh), at))
                    elif t == wq("drawing") or t == "{%s}AlternateContent" % "http://schemas.openxmlformats.org/markup-compatibility/2006":
                        descr = ""
                        for dp in ch.iter("{%s}docPr" % WP):
                            descr = dp.get("descr") or ""
                            break
                        for blip in ch.iter("{%s}blip" % A):
                            rid = blip.get("{%s}embed" % R)
                            if rid:
                                runs.append((self.image_token(rid, images, descr), at))
                                break
                    elif t == wq("pict"):
                        for im in ch.iter("{%s}imagedata" % V):
                            rid = im.get("{%s}id" % R)
                            if rid:
                                runs.append((self.image_token(rid, images), at))
            elif tag in (wq("hyperlink"), wq("smartTag"), wq("ins"), wq("fldSimple"), wq("customXml")):
                self.runs_of(el, pbase, runs, images, in_heading)
            elif tag == wq("sdt"):
                sc = el.find(wq("sdtContent"))
                if sc is not None:
                    self.runs_of(sc, pbase, runs, images, in_heading)

    def marker(self, numid, ilvl):
        lvls, ov = self.nums.get(numid, ({}, {}))
        lvl = lvls.get(ilvl, {"fmt": "bullet", "text": "●", "start": 1})
        indent = "  " * ilvl
        key = numid
        cnt = self.counters.setdefault(key, {})
        if ilvl not in cnt:
            cnt[ilvl] = ov.get(ilvl, lvl["start"]) - 1
        cnt[ilvl] += 1
        for deeper in [k for k in cnt if k > ilvl]:
            del cnt[deeper]
        if lvl["fmt"] == "bullet":
            g = "".join(PUA_BULLETS.get(ch, ch) for ch in lvl["text"]).strip()
            if g in STD_BULLETS or g == "":
                return f"{indent}- "
            return f"{indent}- [glyph:{g}] "
        if lvl["fmt"] == "none":
            return indent

        def fmt_n(n, f):
            if f in ("lowerLetter", "upperLetter"):
                s = css_counter(n, "lower-latin")
                return s.upper() if f == "upperLetter" else s
            if f in ("lowerRoman", "upperRoman"):
                s = css_counter(n, "lower-roman")
                return s.upper() if f == "upperRoman" else s
            if f == "decimalZero":
                return "%02d" % n
            return str(n)

        def rep(m):
            k = int(m.group(1)) - 1
            f = lvls.get(k, {}).get("fmt", "decimal")
            return fmt_n(cnt.get(k, 1), f)

        label = re.sub(r"%(\d)", rep, lvl["text"]).strip()
        return f"{indent}{label} "

    def paragraph(self, p, in_cell=False):
        ppr, sid = self.para_style(p)
        hlevel = self.heading_level(sid)
        pbase = dict(self.default_rpr)
        if sid:
            pbase = self.style_chain_rpr(sid, pbase)
        runs, images = [], []
        self.runs_of(p, pbase, runs, images, hlevel > 0)
        text = finish_inline(render_runs(runs), images)
        marker = ""
        if ppr is not None:
            npr = ppr.find(wq("numPr"))
            if npr is not None:
                ni = npr.find(wq("numId"))
                il = npr.find(wq("ilvl"))
                numid = ni.get(wq("val")) if ni is not None else None
                ilvl = int(il.get(wq("val"))) if il is not None else 0
                if numid and numid != "0" and text:
                    marker = self.marker(numid, ilvl)
        if not text:
            return ""
        if hlevel and not marker:
            return "#" * hlevel + " " + text.replace("\n", " ")
        pad = " " * len(marker)
        return marker + text.replace("\n", "\n" + pad)

    def table(self, tbl):
        rows = []
        for tr in tbl.findall(wq("tr")):
            cells = []
            for tc in tr.findall(wq("tc")):
                parts = []
                for el in tc:
                    if el.tag == wq("p"):
                        t = self.paragraph(el, True)
                        if t:
                            parts.append(t.strip())
                    elif el.tag == wq("tbl"):
                        parts.append("[nested table]")
                cell = " <br> ".join(parts).replace("\n", " <br> ").replace("|", "\\|")
                tcpr = tc.find(wq("tcPr"))
                span = 1
                if tcpr is not None and tcpr.find(wq("gridSpan")) is not None:
                    span = int(tcpr.find(wq("gridSpan")).get(wq("val")))
                cells.append(cell)
                cells.extend([""] * (span - 1))
            rows.append(cells)
        if not rows:
            return
        width = max(len(r) for r in rows)
        self.lines.append("")
        for i, r in enumerate(rows):
            r = r + [""] * (width - len(r))
            self.lines.append("| " + " | ".join(r) + " |")
            if i == 0:
                self.lines.append("|" + "---|" * width)
        self.lines.append("")

    def body(self, container):
        for el in container:
            if el.tag == wq("p"):
                self.lines.append(self.paragraph(el))
            elif el.tag == wq("tbl"):
                self.table(el)
            elif el.tag == wq("sdt"):
                sc = el.find(wq("sdtContent"))
                if sc is not None:
                    self.body(sc)

    def convert(self):
        self.body(self.doc.find(wq("body")))
        return tidy(self.lines)


def convert_docx(path: str, out_dir: str):
    zf = zipfile.ZipFile(path)
    conv = DocxConverter(zf)
    md = conv.convert()
    img_dir = os.path.join(out_dir, "images")
    os.makedirs(img_dir, exist_ok=True)
    written = 0
    media = [n for n in zf.namelist() if n.startswith("word/media/") and not n.endswith("/") and ".." not in n]
    for n in media:
        with open(os.path.join(img_dir, os.path.basename(n)), "wb") as f:
            f.write(zf.read(n))
        written += 1
    unused = sorted(set(os.path.basename(n) for n in media) - set(conv.used_images))
    return md, written, unused


# --------------------------------------------------------------------------
# Google Forms JSON
# --------------------------------------------------------------------------


def _img_note(obj):
    if not obj:
        return ""
    return f"[FORM-IMAGE: {obj.get('contentUri') or 'present'}]"


def _feedback(label, fb):
    if not fb:
        return []
    out = []
    if fb.get("text"):
        out.append(f"{label}: {fb['text']}")
    for m in fb.get("material", []) or []:
        link = m.get("link") or {}
        vid = m.get("video") or {}
        if link:
            out.append(f"{label} link: {link.get('displayText', '')} {link.get('uri', '')}".rstrip())
        if vid:
            out.append(f"{label} video: {vid.get('displayText', '')} {vid.get('youtubeUri', '')}".rstrip())
    return out


def convert_form(path: str):
    d = json.load(open(path, encoding="utf-8"))
    info = d.get("info", {})
    L = [f"# {info.get('title', '')}"]
    if info.get("documentTitle"):
        L.append(f"Document title: {info['documentTitle']}")
    if info.get("description"):
        L.append(info["description"])
    qs = (d.get("settings") or {}).get("quizSettings") or {}
    L.append(f"Quiz: {bool(qs.get('isQuiz'))}")
    L.append("")
    qn = 0
    for item in d.get("items", []):
        title = item.get("title", "")
        desc = item.get("description", "")
        if "pageBreakItem" in item:
            L.append(f"## [SECTION] {title}")
            if desc:
                L.append(desc)
            L.append("")
            continue
        if "textItem" in item:
            L.append(f"### [TEXT-BLOCK] {title}")
            if desc:
                L.append(desc)
            L.append("")
            continue
        if "imageItem" in item:
            L.append(f"### [IMAGE-ITEM] {title}")
            if desc:
                L.append(desc)
            L.append(_img_note((item["imageItem"] or {}).get("image") or {"contentUri": None}) or "[FORM-IMAGE: present]")
            L.append("")
            continue
        if "videoItem" in item:
            v = (item["videoItem"] or {}).get("video") or {}
            L.append(f"### [VIDEO-ITEM] {title} {v.get('youtubeUri', '')}".rstrip())
            if desc:
                L.append(desc)
            L.append("")
            continue
        if "questionGroupItem" in item:
            g = item["questionGroupItem"]
            qn += 1
            grid = g.get("grid") or {}
            cols = (grid.get("columns") or {})
            L.append(f"## Q{qn} [GRID {cols.get('type', '')}] {title}")
            if desc:
                L.append(desc)
            if g.get("image"):
                L.append(_img_note(g["image"]))
            L.append("Columns: " + " | ".join(o.get("value", "") for o in cols.get("options", [])))
            for q in g.get("questions", []):
                row = (q.get("rowQuestion") or {}).get("title", "")
                gr = q.get("grading") or {}
                ans = [a.get("value") for a in ((gr.get("correctAnswers") or {}).get("answers") or [])]
                pts = gr.get("pointValue")
                extra = f" (points: {pts})" if pts is not None else ""
                extra += (" {correct: " + " | ".join(ans) + "}") if ans else ""
                L.append(f"- row: {row}{extra}")
            L.append("")
            continue
        if "questionItem" in item:
            qi = item["questionItem"]
            q = qi.get("question") or {}
            qn += 1
            gr = q.get("grading") or {}
            correct = [a.get("value") for a in ((gr.get("correctAnswers") or {}).get("answers") or [])]
            pts = gr.get("pointValue")
            kind = None
            body = []
            if "choiceQuestion" in q:
                cq = q["choiceQuestion"]
                kind = cq.get("type", "CHOICE")
                seen = set()
                for o in cq.get("options", []):
                    if o.get("isOther"):
                        body.append("- [Other: free text]")
                        continue
                    v = o.get("value", "")
                    line = f"- {v}"
                    if o.get("image"):
                        line += " " + _img_note(o["image"])
                    if v in correct:
                        line += " {correct}"
                        seen.add(v)
                    if o.get("goToAction") or o.get("goToSectionId"):
                        line += f" (go to: {o.get('goToAction') or o.get('goToSectionId')})"
                    body.append(line)
                for v in correct:
                    if v not in seen:
                        body.append(f"- (answer key value not among options) {v} {{correct}}")
            elif "textQuestion" in q:
                kind = "PARAGRAPH_TEXT" if (q["textQuestion"] or {}).get("paragraph") else "TEXT"
                for v in correct:
                    body.append(f"- accepted answer: {v} {{correct}}")
            elif "scaleQuestion" in q:
                s = q["scaleQuestion"]
                kind = "SCALE"
                body.append(f"- scale {s.get('low')}..{s.get('high')} ({s.get('lowLabel', '')} / {s.get('highLabel', '')})")
            else:
                for k in ("dateQuestion", "timeQuestion", "fileUploadQuestion", "ratingQuestion", "rowQuestion"):
                    if k in q:
                        kind = k.replace("Question", "").upper()
                kind = kind or "UNKNOWN"
                for v in correct:
                    body.append(f"- accepted answer: {v} {{correct}}")
            hdr = f"## Q{qn} [{kind}]"
            if pts is not None:
                hdr += f" (points: {pts})"
            elif gr:
                hdr += " (points: not set)"
            if q.get("required"):
                hdr += " (required)"
            L.append(hdr)
            L.append(title)
            if desc:
                L.append(desc)
            if qi.get("image"):
                L.append(_img_note(qi["image"]))
            L.extend(body)
            L.extend(_feedback("General feedback", gr.get("generalFeedback")))
            L.extend(_feedback("Feedback when right", gr.get("whenRight")))
            L.extend(_feedback("Feedback when wrong", gr.get("whenWrong")))
            L.append("")
            continue
        L.append(f"## [UNKNOWN ITEM] {title} keys={sorted(k for k in item if k not in ('itemId', 'title', 'description'))}")
        L.append("")
    return tidy(L)


# --------------------------------------------------------------------------
# naming / classification
# --------------------------------------------------------------------------


def base_name(fname: str) -> str:
    for ext in (".html.zip", ".form.json", ".docx", ".txt", ".pdf"):
        if fname.lower().endswith(ext):
            return fname[: -len(ext)]
    return os.path.splitext(fname)[0]


def make_slug(fname: str, is_form: bool) -> str:
    name = base_name(fname)
    m = re.match(r"\s*Season\s*(\d+)", name, re.I)
    season = f"s{m.group(1)}" if m else ""
    sisters = bool(re.search(r"\bsisters\b", name, re.I))
    rest = name.split("__", 1)[1] if "__" in name else name
    r = rest.lower()
    r = re.sub(r"\(\s*sisters\s*\)|\bsisters\b", " ", r)
    r = re.sub(r"\(\s*matn included\s*\)", " matn ", r)
    r = re.sub(r"_?mark\s*scheme_?", " markscheme ", r)
    r = re.sub(r"\bq(uestion)?\s+bank\b", " bank ", r)
    r = re.sub(r"\b\d\d[_-]\d\d\b", " ", r)
    r = re.sub(r"\b(bsms|tajweed|of)\b", " ", r)
    toks = [t for t in re.split(r"[^a-z0-9]+", r) if t]
    seen = []
    for t in toks:
        if t not in seen:
            seen.append(t)
    parts = [p for p in [season, "sisters" if sisters else "", "-".join(seen), "form" if is_form else ""] if p]
    slug = "-".join(parts)
    return re.sub(r"-+", "-", slug).strip("-")[:60] or "doc"


def kind_guess(fname: str, is_form: bool) -> str:
    n = fname.lower()
    if is_form:
        return "form"
    if re.search(r"mark\s*scheme|markscheme", n):
        return "mark_scheme"
    if re.search(r"\bbank\b", n):
        return "bank"
    return "exam"


# --------------------------------------------------------------------------
# verification against .txt export
# --------------------------------------------------------------------------

MARKER_RE = re.compile(
    r"\{/?(?:hl|color)(?::#[0-9a-f]{6})?\}|(?<!\\)\*\*|(?<![_\\])__(?!_)"
    r"|\[IMG: [^\]]*\]|\[(?: |x)\] |\[glyph:[^\]]*\] |\[frame:[^\]]*\] ?"
)


def _norm_for_compare(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = s.replace("﻿", "")
    s = re.sub(r"[\s ​-‏‪-‮⁦-⁩]+", " ", s)
    return s.strip()


def strip_md(md: str) -> str:
    out = []
    for ln in md.split("\n"):
        ln = re.sub(r'\[IMG: images/\S+ \S+ alt="([^"]*)"\]', r" \1 ", ln)
        ln = MARKER_RE.sub("", ln)
        ln = re.sub(r"^\s*#+ ", "", ln)
        ln = re.sub(r"^\s*- ", "", ln)
        ln = re.sub(r"\[([^\]]*)\]\((?:https?|mailto)[^)]*\)", r"\1", ln)
        ln = ln.replace("<br>", " ").replace("\\|", "|").replace("\\*", "*").replace("\\_", "_")
        ln = ln.replace("\\\\", "\\")
        out.append(ln)
    return "\n".join(out)


def verify(md: str, txt: str):
    """Return (txt lines missing from md, txt question-line count, md question-line count)."""
    body = _norm_for_compare(strip_md(md))
    body_nospace = body.replace(" ", "")
    missing = []
    for ln in txt.split("\n"):
        # .txt writes each list item as "* " and drops images, so image-only list
        # items leave runs of bare "*" tokens: drop those tokens
        t = re.sub(r"(?:(?<=\s)|^)[*•●](?=\s|$)", " ", ln.replace("﻿", ""))
        t = _norm_for_compare(t)
        if not t or re.fullmatch(r"_{8,}", t):  # a line of underscores = horizontal rule
            continue
        if t in body or t.replace(" ", "") in body_nospace:
            continue
        # .txt numbers Google list items itself ("1. ", "a. "); try without that prefix
        t2 = re.sub(r"^(\(?[0-9a-zA-Z]{1,3}[.)]\s*)+", "", t)
        if t2 and (t2 in body or t2.replace(" ", "") in body_nospace):
            continue
        missing.append(ln.strip())
    qre = re.compile(r"\((\d+)\s*marks?\)|\[(\d+)\s*marks?\]", re.I)
    return missing, len(qre.findall(txt)), len(qre.findall(strip_md(md)))


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    src, out = os.path.abspath(argv[1]), os.path.abspath(argv[2])
    do_verify = "--verify" in argv
    if out.startswith(src + os.sep) or out == src:
        print("output dir must not be inside the source dir", file=sys.stderr)
        return 2
    os.makedirs(out, exist_ok=True)
    jobs = []
    names = sorted(os.listdir(src))
    html_bases = {base_name(n) for n in names if n.lower().endswith(".html.zip")}
    for n in names:
        p = os.path.join(src, n)
        if n.lower().endswith(".html.zip"):
            jobs.append((n, p, "html", False))
        elif n.lower().endswith(".docx") and base_name(n) not in html_bases:
            jobs.append((n, p, "docx", False))
    fdir = os.path.join(src, "forms")
    if os.path.isdir(fdir):
        for n in sorted(os.listdir(fdir)):
            if n.lower().endswith(".form.json"):
                jobs.append(("forms/" + n, os.path.join(fdir, n), "form", True))

    index = []
    used_slugs = set()
    rc = 0
    for rel, path, kind, is_form in jobs:
        fname = os.path.basename(rel)
        slug = make_slug(fname, is_form)
        base_slug, k = slug, 2
        while slug in used_slugs:
            slug = f"{base_slug}-{k}"
            k += 1
        used_slugs.add(slug)
        odir = os.path.join(out, slug)
        os.makedirs(odir, exist_ok=True)
        entry = {"slug": slug, "source_file": rel, "kind_guess": kind_guess(fname, is_form)}
        try:
            if kind == "html":
                md, nimg, unused = convert_html_zip(path, odir)
            elif kind == "docx":
                md, nimg, unused = convert_docx(path, odir)
            else:
                md, nimg, unused = convert_form(path), 0, []
            with open(os.path.join(odir, "doc.md"), "w", encoding="utf-8") as f:
                f.write(md)
            entry.update(chars=len(md), image_count=nimg)
            if unused:
                entry["images_not_referenced"] = unused
            if do_verify and not is_form:
                tp = os.path.join(src, base_name(fname) + ".txt")
                if os.path.exists(tp):
                    txt = open(tp, encoding="utf-8-sig").read()
                    missing, qt, qm = verify(md, txt)
                    entry["verify"] = {"txt_mark_tags": qt, "md_mark_tags": qm, "txt_lines_missing": missing}
        except Exception as e:  # keep going; report per source
            entry.update(error=f"{type(e).__name__}: {e}", chars=0, image_count=0)
            rc = 1
        index.append(entry)
        status = entry.get("error") or f"{entry['chars']} chars, {entry['image_count']} images"
        print(f"{slug:40s} {entry['kind_guess']:12s} {status}")
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv))
