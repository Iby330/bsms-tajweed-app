#!/usr/bin/env python3
"""
exam_bank_merge.py — per-group extracted exam questions → one de-duplicated bank.

  python3 -I execution/exam_bank_merge.py <Q dir> <T dir> <out bank.json> [--report <out.md>]
  python3 -I execution/exam_bank_merge.py --self-test

Inputs
  Q/G*.json   one file per source group, format in Q/INSTRUCTIONS.md (Task 2 of
              docs/superpowers/plans/2026-11-19-exam-builder.md). Whichever exist
              are merged; a missing group is simply absent.
  T/          the exam_doc_to_text.py output; every picture path in the JSON is
              relative to T ("s5-eot2-exam-copy/images/image3.png").

Output (bank.json), read by execution/exam_bank_import.ts:
  {"generated_at", "images": {storage_path: {storage_path, local_file, bytes, sha1}},
   "questions": [{import_key, topic_id, kind, prompt, prompt_images, prompt_quran,
                  options, select_many, answer, marks, sources, used_in,
                  review_status, review_note, origin_keys}]}

What it does
  1. Validates every question. Nothing is dropped: whatever is safely fixable is
     fixed (unknown topic → the parent's `.general`, or the standalone subject,
     else intro.tajweed; a missing/empty/unknown-type picture is removed) and the
     question is forced to review_status "check" with a note saying why.
  2. Renames every picture to bank/<sha1 of bytes>.<ext> (ext from magic bytes),
     so the same picture in two documents is one storage object.
  3. De-duplicates ACROSS groups (never two questions of the same group — the
     extractors already de-duplicated inside a group and kept look-alikes apart
     on purpose). Same question when: same kind, same normalised prompt, same
     multiset of prompt-picture hashes and (mcq) same set of (option text,
     option-picture hash). Or: prompts near-identical (difflib ratio >= 0.93)
     with the pictures and options identical, and either side has a picture or
     the prompt is longer than 40 normalised characters.
  4. Winner = an exam version (a source of kind exam/form and a non-empty
     used_in), most recent season first (25/26 beats 23/24); else first seen.
     Its wording/pictures/options/marks are kept; answer, correct-option flags,
     marks and quran_ref are filled from a loser only when the winner has none
     (with a note, which makes the question "check"); sources and used_in are
     unioned.
  5. import_key = "imp-" + sha1(kind \n prompt \n picture hashes \n options)[:16],
     content-only, so it is stable across re-runs and group renumbering. Two
     distinct questions with the same key get -2, -3 … in order of their
     original (G*-NNN) key.

Standard library only. The input JSON is untrusted data: run with `python3 -I`.
Picture paths are confined to T (no absolute paths, no "..").
"""

from __future__ import annotations

import argparse
import collections
import difflib
import hashlib
import json
import os
import re
import sys
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

# Topic ids seeded by web/supabase/migrations/0152_exam_builder.sql. The import
# re-checks them against the live exam_bank_topics table before writing.
TOPICS = {
    "intro": None, "intro.tajweed": "intro", "intro.mistakes": "intro",
    "noon": None, "noon.ghunna": "noon", "noon.idhaar": "noon", "noon.idghaam": "noon",
    "noon.iqlaab": "noon", "noon.ikhfaa": "noon", "noon.general": "noon",
    "meem": None, "meem.ikhfaa": "meem", "meem.idghaam": "meem", "meem.idhaar": "meem",
    "meem.general": "meem",
    "sifaat": None, "sifaat.heavy": "sifaat", "sifaat.laam": "sifaat", "sifaat.ra": "sifaat",
    "sifaat.qalqala": "sifaat", "sifaat.hams": "sifaat", "sifaat.hamzatul-wasl": "sifaat",
    "sifaat.iltiqa": "sifaat", "sifaat.general": "sifaat",
    "mudood": None, "mudood.overview": "mudood", "mudood.muttasil": "mudood",
    "mudood.munfasil": "mudood", "mudood.aarid": "mudood", "mudood.lazim": "mudood",
    "mudood.general": "mudood",
    "waqf": None, "ummul-kitab": None, "adaab": None, "seerah": None, "matn": None,
}
PARENTS_WITH_CHILDREN = {p for p in TOPICS.values() if p}
STANDALONE = {t for t, p in TOPICS.items() if p is None and t not in PARENTS_WITH_CHILDREN}
TOPIC_ALIASES = {
    "fatiha": "ummul-kitab", "fatihah": "ummul-kitab", "al-fatihah": "ummul-kitab",
    "ummul-kitaab": "ummul-kitab", "umm-ul-kitab": "ummul-kitab",
    "adab": "adaab", "aadaab": "adaab", "a-daab": "adaab", "sirah": "seerah", "seera": "seerah",
    "tajweed": "intro.tajweed", "intro": "intro.tajweed",
    "madd": "mudood.general", "mudud": "mudood.general",
}
FALLBACK_TOPIC = "intro.tajweed"
SOURCE_KINDS = {"exam", "mark_scheme", "bank", "form"}
MAX_PICTURE_BYTES = 3 * 1024 * 1024  # bucket file_size_limit in 0152
NEAR_RATIO = 0.93
NEAR_MIN_LEN = 40

# ── normalisation (for comparison and keys only; stored text is untouched) ──

_LEAD = [
    re.compile(r"^\s*q(?:uestion)?\s*\d*\s*[.:)\-]\s*", re.I),   # "Q." "Q12:" "Question 3)"
    re.compile(r"^\s*q\s*\d+\s+", re.I),                         # "Q12 "
    re.compile(r"^\s*[a-d]?\d{1,3}\s*[.):\-]\s*", re.I),         # "12." "A12)" "3 -"
    re.compile(r"^\s*\(\s*[a-d]?\d{1,3}\s*\)\s*", re.I),         # "(12)"
]
_TRAIL = re.compile(
    r"(?:\s*[\[(]\s*\d+(?:\.\d+)?\s*(?:marks?|m)?\s*[\])])+\s*$", re.I)  # "(1 mark)" "[2]" "(1)"
_TATWEEL = "ـ"
# Alef forms (wasla, hamza above/below, madda) and alef maqsura fold together,
# so a Uthmani spelling and a plain-keyboard spelling of a word compare equal.
_FOLD = str.maketrans({"ٱ": "ا", "أ": "ا", "إ": "ا",
                       "آ": "ا", "ى": "ي"})


def norm_text(s: str | None, *, strip_lead: bool = True) -> str:
    """Comparison form: NFKC (NFC plus folding Arabic presentation forms the
    exports sometimes contain), lower-case, no leading number / trailing marks
    tag, no punctuation, no Arabic diacritics or tatweel, single spaces."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", str(s)).lower().translate(_FOLD)
    if strip_lead:
        for rx in _LEAD:
            s = rx.sub("", s, count=1)
    s = _TRAIL.sub("", s)
    out = []
    for ch in s:
        if ch == _TATWEEL:
            continue
        cat = unicodedata.category(ch)
        if cat == "Mn":                       # Arabic harakat, shadda, sukun, small high marks
            continue
        if cat.startswith("P"):
            out.append(" ")
            continue
        out.append(ch)
    return " ".join("".join(out).split())


# ── pictures ────────────────────────────────────────────────────────────────

def sniff_ext(head: bytes) -> str | None:
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "gif"
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


class Pictures:
    """Resolves picture paths under T to content-addressed storage paths."""

    def __init__(self, t_dir: Path):
        self.root = t_dir.resolve()
        self.images: dict[str, dict] = {}
        self._cache: dict[str, tuple[str | None, str | None, str | None]] = {}

    def resolve(self, rel) -> tuple[str | None, str | None, str | None]:
        """→ (storage_path, sha1, problem). problem is None when the picture is usable."""
        key = rel if isinstance(rel, str) else repr(rel)
        if key in self._cache:
            return self._cache[key]
        res = self._resolve(rel)
        self._cache[key] = res
        return res

    def _resolve(self, rel):
        if not isinstance(rel, str) or not rel.strip():
            return None, None, "picture path not a string"
        if os.path.isabs(rel) or ".." in Path(rel).parts:
            return None, None, f"picture path outside the text folder ({rel})"
        p = (self.root / rel).resolve()
        try:
            p.relative_to(self.root)
        except ValueError:
            return None, None, f"picture path outside the text folder ({rel})"
        if not p.is_file():
            return None, None, "picture file missing"
        data = p.read_bytes()
        if not data:
            return None, None, "picture file empty"
        ext = sniff_ext(data[:16])
        if not ext:
            return None, None, "picture not png/jpg/gif/webp"
        sha = hashlib.sha1(data).hexdigest()
        sp = f"bank/{sha}.{ext}"
        self.images.setdefault(sp, {"storage_path": sp, "local_file": str(p), "bytes": len(data), "sha1": sha})
        problem = "picture over 3 MB (bucket limit)" if len(data) > MAX_PICTURE_BYTES else None
        return sp, sha, problem


def sha_of(storage_path: str | None) -> str:
    if not storage_path:
        return ""
    return storage_path.split("/", 1)[1].split(".", 1)[0]


# ── validation ─────────────────────────────────────────────────────────────

def split_reasons(note: str | None) -> list[str]:
    """Split an extraction note into its reasons at ";", " | " or newlines —
    only outside brackets, so "marks not stated (bank only; …)" stays whole."""
    if not note:
        return []
    out, buf, depth, i = [], [], 0, 0
    while i < len(note):
        ch = note[i]
        if ch in "([":
            depth += 1
        elif ch in ")]" and depth:
            depth -= 1
        if depth == 0 and (ch in ";\n" or note.startswith(" | ", i)):
            out.append("".join(buf))
            buf = []
            i += 3 if ch == " " else 1
            continue
        buf.append(ch)
        i += 1
    out.append("".join(buf))
    return [r.strip() for r in out if r.strip()]


# Reasons that alone do not need an admin's look: missing marks / missing answer
# (the app shows "No answer yet" from answer being null), and the Seerah bank's
# informational tags. Anything else keeps a "check" question as "check".
_ROUTINE_MISSING = re.compile(
    r"^(?:marks not stated|no marks stated|marks not given|"
    r"no answer in (?:source|bank)|no answer given|answer not in source|no answer line)"
    r"[\s.]*(?:\((?P<paren>[^()]*(?:\([^()]*\)[^()]*)*)\))?[\s.]*$", re.I)
# A bracketed aside that points at an answer or key elsewhere is worth a look.
_PAREN_HINT = re.compile(r"\b(?:key|keys|accept|accepts|accepted|answer|answers|correct)\b", re.I)
_ROUTINE_INFO = re.compile(
    r"^(?:source highlight:.*|source text: red.*|distinction question.*|"
    r"from the videos only.*|seerah \d+)[\s.]*$", re.I)


def is_routine(reason: str) -> bool:
    if _ROUTINE_INFO.match(reason):
        return True
    m = _ROUTINE_MISSING.match(reason)
    return bool(m) and not (m.group("paren") and _PAREN_HINT.search(m.group("paren")))


def fix_topic(raw) -> tuple[str, str | None]:
    if isinstance(raw, str) and raw in TOPICS and raw not in PARENTS_WITH_CHILDREN:
        return raw, None
    s = re.sub(r"[\s_]+", "-", str(raw or "").strip().lower())
    if s in TOPICS and s not in PARENTS_WITH_CHILDREN:
        return s, f"topic {raw!r} normalised"
    if s in PARENTS_WITH_CHILDREN:
        return f"{s}.general", f"topic {raw!r} is a series, used {s}.general"
    if s in TOPIC_ALIASES:
        return TOPIC_ALIASES[s], f"unknown topic {raw!r}, guessed {TOPIC_ALIASES[s]}"
    head = re.split(r"[.\-/]", s, maxsplit=1)[0] if s else ""
    if head in PARENTS_WITH_CHILDREN:
        return f"{head}.general", f"unknown topic {raw!r}, used {head}.general"
    if head in STANDALONE:
        return head, f"unknown topic {raw!r}, used {head}"
    if head in TOPIC_ALIASES:
        return TOPIC_ALIASES[head], f"unknown topic {raw!r}, guessed {TOPIC_ALIASES[head]}"
    return FALLBACK_TOPIC, f"unknown topic {raw!r}, defaulted to {FALLBACK_TOPIC}"


def clean_marks(raw) -> tuple[float | None, str | None]:
    if raw is None:
        return None, None
    try:
        v = float(raw) if not isinstance(raw, bool) else None
    except (TypeError, ValueError):
        v = None
    if v is None or v != v or v < 0 or v >= 1000:
        return None, f"marks {raw!r} unreadable, cleared"
    v = round(v, 1)
    return (int(v) if v == int(v) else v), None


def clean_quran(raw) -> tuple[dict | None, str | None]:
    if raw is None:
        return None, None
    try:
        s, a, b = int(raw["surah"]), int(raw["from_ayah"]), int(raw["to_ayah"])
        if not (1 <= s <= 114 and 1 <= a <= b <= 286):
            raise ValueError
        out = {"surah": s, "from_ayah": a, "to_ayah": b}
        for k in ("from_word", "to_word"):
            if raw.get(k) is not None:
                out[k] = int(raw[k])
        return out, None
    except (TypeError, ValueError, KeyError, AttributeError):
        return None, "quran_ref unreadable, dropped"


def validate(q: dict, group: str, idx: int, pics: Pictures) -> dict:
    """Return a cleaned internal question. Never raises on bad data."""
    notes: list[str] = []
    if not isinstance(q, dict):
        q = {}
        notes.append("question entry was not an object")
    key = q.get("key") if isinstance(q.get("key"), str) and q.get("key") else f"{group}-#{idx + 1:03d}"

    prompt = q.get("prompt")
    if not isinstance(prompt, str):
        prompt = "" if prompt is None else str(prompt)
        notes.append("prompt not text")
    prompt = prompt.strip()

    # pictures in the prompt
    prompt_images, prompt_hashes = [], []
    raw_imgs = q.get("prompt_images") or []
    if not isinstance(raw_imgs, list):
        raw_imgs = [raw_imgs]
        notes.append("prompt_images not a list")
    for rel in raw_imgs:
        sp, sha, problem = pics.resolve(rel)
        if sp:
            prompt_images.append(sp)
            prompt_hashes.append(sha)
        if problem:
            notes.append(problem)
    if not prompt and not prompt_images:
        notes.append("empty prompt")

    # options and kind
    kind = q.get("kind")
    raw_opts = q.get("options")
    options = None
    if isinstance(raw_opts, list) and raw_opts:
        options = []
        for o in raw_opts:
            if not isinstance(o, dict):
                o = {"text": "" if o is None else str(o)}
                notes.append("option not an object")
            text = o.get("text")
            text = "" if text is None else str(text).strip()
            img = None
            if o.get("image"):
                sp, _sha, problem = pics.resolve(o.get("image"))
                img = sp
                if problem:
                    notes.append(f"option {problem}")
            correct = o.get("correct")
            if not isinstance(correct, bool):
                if correct is not None:
                    notes.append("option correct flag not true/false")
                correct = bool(correct is True)
            if not text and not img:
                notes.append("an option has neither text nor picture")
            options.append({"text": text, "image": img, "correct": correct})
    elif raw_opts not in (None, []):
        notes.append("options not a list, dropped")

    if kind not in ("mcq", "short"):
        new = "mcq" if options and len(options) >= 2 else "short"
        notes.append(f"kind {kind!r} unknown, set to {new}")
        kind = new
    if kind == "mcq" and (not options or len(options) < 2):
        notes.append("mcq without at least two options, made short")
        kind = "short"
    if kind == "short" and options:
        if len(options) >= 2:
            notes.append("short question carried options, made mcq")
            kind = "mcq"
        else:
            notes.append("short question carried an option, dropped")
            options = None
    if kind == "short":
        options = None

    select_many = q.get("select_many") is True
    if kind == "mcq":
        n_correct = sum(o["correct"] for o in options)
        if n_correct > 1 and not select_many:
            select_many = True
            notes.append("several options marked correct, select_many set")
    else:
        select_many = False

    answer = q.get("answer")
    if answer is not None and not isinstance(answer, str):
        answer = str(answer)
        notes.append("answer not text")
    answer = (answer or "").strip() or None

    marks, mnote = clean_marks(q.get("marks"))
    if mnote:
        notes.append(mnote)
    topic, tnote = fix_topic(q.get("topic"))
    if tnote:
        notes.append(tnote)
    quran, qnote = clean_quran(q.get("quran_ref"))
    if qnote:
        notes.append(qnote)

    sources, seen = [], set()
    raw_src = q.get("sources") or []
    if not isinstance(raw_src, list):
        raw_src = []
        notes.append("sources not a list")
    for s in raw_src:
        if not isinstance(s, dict) or not str(s.get("label") or "").strip():
            notes.append("a source had no label, dropped")
            continue
        sk = s.get("kind")
        if sk not in SOURCE_KINDS:
            notes.append(f"source kind {sk!r} unknown, set to bank")
            sk = "bank"
        src = {"label": str(s["label"]).strip(), "kind": sk}
        if s.get("number") not in (None, ""):
            src["number"] = str(s["number"]).strip()
        ident = (src["label"], src["kind"], src.get("number"))
        if ident not in seen:
            seen.add(ident)
            sources.append(src)
    if not sources:
        notes.append("no source recorded")

    used_raw = q.get("used_in") or []
    if not isinstance(used_raw, list):
        used_raw = [used_raw]
        notes.append("used_in not a list")
    used_in = sorted({str(u).strip() for u in used_raw if str(u or "").strip()})

    status = q.get("status")
    note = q.get("note")
    note = str(note).strip() if note not in (None, "") else None
    src_status = status
    if status not in ("clean", "check"):
        notes.append(f"status {status!r} unknown")
        status = "check"
    downgraded = False
    reasons = split_reasons(note)
    if status == "check" and reasons and all(is_routine(r) for r in reasons) and not notes:
        status, downgraded = "clean", True
    if notes:
        status = "check"

    return {
        "group": group, "key": key, "kind": kind, "prompt": prompt,
        "prompt_images": prompt_images, "prompt_hashes": prompt_hashes,
        "options": options, "select_many": select_many, "answer": answer,
        "marks": marks, "topic_id": topic, "prompt_quran": quran,
        "sources": sources, "used_in": used_in, "status": status,
        "src_status": src_status, "downgraded": downgraded, "fixes": list(dict.fromkeys(notes)),
        "note_parts":([note] if note else []) + list(dict.fromkeys(notes)),
        "nprompt": norm_text(prompt),
    }


# ── identity, ranking, merging ────────────────────────────────────────────

def option_sig(q: dict) -> frozenset:
    if q["kind"] != "mcq" or not q["options"]:
        return frozenset()
    return frozenset((norm_text(o["text"], strip_lead=False), sha_of(o["image"])) for o in q["options"])


def block_sig(q: dict) -> tuple:
    return (q["kind"], tuple(sorted(q["prompt_hashes"])), option_sig(q))


def import_key_of(q: dict) -> str:
    opts = sorted(f"{t}|{h}" for t, h in option_sig(q))
    raw = "\n".join([q["kind"], q["nprompt"], ",".join(sorted(q["prompt_hashes"])), "\n".join(opts)])
    return "imp-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


_SEASON = re.compile(r"(\d{2})\s*[/\-]\s*(\d{2})")
_SEASON_N = re.compile(r"\b(?:season|s)\s*(\d)\b", re.I)


def season_of(text: str) -> int:
    """Start year (two digits) of the season a label names; 0 when none."""
    m = _SEASON.search(text or "")
    if m:
        return int(m.group(1))
    m = _SEASON_N.search(text or "")
    if m:                       # Season 3 = 23/24, Season 5 = 25/26
        return 20 + int(m.group(1))
    return 0


def rank(q: dict, order: int) -> tuple:
    is_exam = bool(q["used_in"]) and any(s["kind"] in ("exam", "form") for s in q["sources"])
    season = max([season_of(u) for u in q["used_in"]] + [0]) if is_exam else 0
    return (0 if is_exam else 1, -season, order)


def near_same(a: dict, b: dict) -> bool:
    if a["nprompt"] == b["nprompt"]:
        return True
    if not (a["prompt_hashes"] or b["prompt_hashes"]
            or len(a["nprompt"]) > NEAR_MIN_LEN or len(b["nprompt"]) > NEAR_MIN_LEN):
        return False
    return difflib.SequenceMatcher(None, a["nprompt"], b["nprompt"], autojunk=False).ratio() >= NEAR_RATIO


def first_label(q: dict) -> str:
    return f"{q['sources'][0]['label']} ({q['key']})" if q["sources"] else q["key"]


def merge_cluster(members: list[dict]) -> dict:
    order = sorted(range(len(members)), key=lambda i: rank(members[i], i))
    win = members[order[0]]
    losers = [members[i] for i in order[1:]]
    out = dict(win)
    notes = list(win["note_parts"])
    added = []

    if not out["answer"]:
        for l in losers:
            if l["answer"]:
                out["answer"] = l["answer"]
                added.append(f"answer taken from {first_label(l)}")
                break
    if out["kind"] == "mcq" and not any(o["correct"] for o in out["options"]):
        for l in losers:
            if l["options"] and any(o["correct"] for o in l["options"]):
                flags = {(norm_text(o["text"], strip_lead=False), sha_of(o["image"])): o["correct"] for o in l["options"]}
                out["options"] = [dict(o, correct=flags.get((norm_text(o["text"], strip_lead=False), sha_of(o["image"])), False))
                                  for o in out["options"]]
                out["select_many"] = out["select_many"] or l["select_many"] or sum(o["correct"] for o in out["options"]) > 1
                added.append(f"correct option taken from {first_label(l)}")
                break
    if out["marks"] is None:
        for l in losers:
            if l["marks"] is not None:
                out["marks"] = l["marks"]
                added.append(f"marks taken from {first_label(l)}")
                break
    if out["prompt_quran"] is None:
        for l in losers:
            if l["prompt_quran"] is not None:
                out["prompt_quran"] = l["prompt_quran"]
                break

    sources, seen = [], set()
    for m in [win] + losers:
        for s in m["sources"]:
            ident = (s["label"], s["kind"], s.get("number"))
            if ident not in seen:
                seen.add(ident)
                sources.append(s)
    out["sources"] = sources
    out["used_in"] = sorted({u for m in members for u in m["used_in"]})
    out["status"] = "check" if (win["status"] == "check" or added) else "clean"
    out["note_parts"] = list(dict.fromkeys(notes + added))
    out["origin_keys"] = [win["key"]] + [l["key"] for l in losers]
    return out


def merge(groups: dict[str, list], t_dir: Path) -> dict:
    """groups: {group name: raw question list}. Returns the bank plus stats."""
    pics = Pictures(t_dir)
    flat = []
    per_group_in = collections.Counter()
    for g in sorted(groups):
        for i, raw in enumerate(groups[g]):
            flat.append(validate(raw, g, i, pics))
            per_group_in[g] += 1

    # Clusters: each new question joins the first cluster it matches that has
    # no member from its own group yet; otherwise it starts its own.
    clusters: list[list[dict]] = []
    by_block: dict[tuple, list[int]] = collections.defaultdict(list)
    within_group_twins = 0
    for q in flat:
        placed = False
        for ci in by_block[block_sig(q)]:
            c = clusters[ci]
            if not any(near_same(q, m) for m in c):
                continue
            if any(m["group"] == q["group"] for m in c):
                within_group_twins += 1
                continue
            c.append(q)
            placed = True
            break
        if not placed:
            by_block[block_sig(q)].append(len(clusters))
            clusters.append([q])

    merged = [merge_cluster(c) for c in clusters]

    # Stable keys, collisions suffixed in order of the winner's original key.
    for m in merged:
        m["base_key"] = import_key_of(m)
    merged.sort(key=lambda m: (m["base_key"], m["key"]))
    count = collections.Counter()
    for m in merged:
        count[m["base_key"]] += 1
        n = count[m["base_key"]]
        m["import_key"] = m["base_key"] if n == 1 else f"{m['base_key']}-{n}"

    used_images = set()
    questions = []
    for m in sorted(merged, key=lambda m: (m["topic_id"], m["key"])):
        used_images.update(m["prompt_images"])
        for o in m["options"] or []:
            if o["image"]:
                used_images.add(o["image"])
        questions.append({
            "import_key": m["import_key"], "topic_id": m["topic_id"], "kind": m["kind"],
            "prompt": m["prompt"], "prompt_images": m["prompt_images"],
            "prompt_quran": m["prompt_quran"], "options": m["options"],
            "select_many": m["select_many"], "answer": m["answer"], "marks": m["marks"],
            "sources": m["sources"], "used_in": m["used_in"],
            "review_status": m["status"],
            "review_note": " | ".join(m["note_parts"]) or None,
            "origin_keys": m["origin_keys"],
        })
    images = {k: v for k, v in sorted(pics.images.items()) if k in used_images}
    bank = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "images": images, "questions": questions}
    per_group = {}
    for g in per_group_in:
        mine = [q for q in flat if q["group"] == g]
        won = [m for m in merged if m["group"] == g]
        per_group[g] = {
            "in": len(mine),
            "out": len(won),
            "check_in_source": sum(q["src_status"] != "clean" for q in mine),
            "downgraded": sum(q["downgraded"] for q in mine),
            "validation_fixed": sum(bool(q["fixes"]) for q in mine),
            "check_after_validation": sum(q["status"] == "check" for q in mine),
            "check_in_bank": sum(m["status"] == "check" for m in won),
        }
    stats = {
        "per_group_in": per_group_in,
        "per_group_out": collections.Counter(m["group"] for m in merged),
        "per_group": per_group,
        "merges": [c for c in clusters if len(c) > 1],
        "within_group_twins": within_group_twins,
        "downgraded": sum(q["downgraded"] for q in flat),
        "fix_reasons": collections.Counter(f for q in flat for f in q["fixes"]),
    }
    return {"bank": bank, "stats": stats}


# ── report ─────────────────────────────────────────────────────────────────

def report(bank: dict, stats: dict) -> str:
    qs = bank["questions"]
    L = ["# Exam bank merge report", "", f"Generated {bank['generated_at']}", ""]
    L += ["## Groups", "",
          "| group | in | kept as the bank's version | check in source | downgraded (routine notes only) "
          "| fixed by validation | check after validation | check in bank (its winners) |",
          "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"]
    for g, s in sorted(stats["per_group"].items()):
        L.append(f"| {g} | {s['in']} | {s['out']} | {s['check_in_source']} | {s['downgraded']} "
                 f"| {s['validation_fixed']} | {s['check_after_validation']} | {s['check_in_bank']} |")
    total_in = sum(stats["per_group_in"].values())
    L += ["", f"{total_in} in → {len(qs)} out. Cross-group merges: {len(stats['merges'])}. "
          f"Same-group look-alikes left separate: {stats['within_group_twins']}. "
          f"Downgraded check → clean because every reason was routine (missing marks / missing answer / "
          f"Seerah info tags): {stats['downgraded']}.", ""]
    if stats["fix_reasons"]:
        L += ["## Validation fixes", ""]
        for r, n in stats["fix_reasons"].most_common():
            L.append(f"- {n} × {r}")
        L.append("")
    if stats["merges"]:
        L += ["## Cross-group merges", ""]
        for c in stats["merges"]:
            L.append("- " + "  ⟷  ".join(f"`{m['key']}` {m['prompt'][:80]!r}" for m in c))
        L.append("")

    def table(title, counter):
        L.extend([f"## {title}", "", "| | count |", "| --- | ---: |"])
        for k, v in sorted(counter.items(), key=lambda kv: (-kv[1], str(kv[0]))):
            L.append(f"| {k} | {v} |")
        L.append("")

    table("By parent topic", collections.Counter(q["topic_id"].split(".")[0] for q in qs))
    table("By kind", collections.Counter(q["kind"] for q in qs))
    table("Review status", collections.Counter(q["review_status"] for q in qs))
    table("Answer", collections.Counter(
        "with answer" if (q["answer"] or (q["kind"] == "mcq" and any(o["correct"] for o in q["options"])))
        else "without answer" for q in qs))
    table("Pictures", collections.Counter("with pictures" if q["prompt_images"] or any(
        o["image"] for o in q["options"] or []) else "no pictures" for q in qs))
    def reasons_of(rows):
        return collections.Counter(
            r.rstrip(". ").lower() for q in rows if q["review_note"]
            for part in q["review_note"].split(" | ") for r in split_reasons(part))
    L += ["## Top note reasons on questions left as check", ""]
    for r, n in reasons_of([q for q in qs if q["review_status"] == "check"]).most_common(15):
        L.append(f"- {n} × {r}")
    L += ["", "## Top note reasons on clean questions (kept as information)", ""]
    for r, n in reasons_of([q for q in qs if q["review_status"] == "clean"]).most_common(8):
        L.append(f"- {n} × {r}")
    same = collections.defaultdict(list)
    for q in qs:
        same[(q["kind"], norm_text(q["prompt"]))].append(q)
    apart = [v for v in same.values() if len(v) > 1]
    L += ["", f"## Same wording kept apart ({len(apart)})", "",
          "Different pictures or options, so not merged. Where the pictures are the same ayah cropped "
          "differently by two documents these are true repeats an admin can archive.", ""]
    for v in apart:
        L.append(f"- {v[0]['prompt'][:80]!r}: " + ", ".join("+".join(q["origin_keys"]) for q in v))
    L += ["", f"Pictures: {len(bank['images'])} unique files, "
          f"{sum(v['bytes'] for v in bank['images'].values()) / 1024:.0f} KB.", ""]
    return "\n".join(L)


def summary(bank: dict, stats: dict) -> str:
    qs = bank["questions"]
    by_parent = collections.Counter(q["topic_id"].split(".")[0] for q in qs)
    st = collections.Counter(q["review_status"] for q in qs)
    kinds = collections.Counter(q["kind"] for q in qs)
    lines = [
        "groups (in / check in source → check after validation / downgraded / validation-fixed): " + "; ".join(
            f"{g} {s['in']} / {s['check_in_source']}→{s['check_after_validation']} / {s['downgraded']} / {s['validation_fixed']}"
            for g, s in sorted(stats["per_group"].items())),
        f"questions: {sum(stats['per_group_in'].values())} in → {len(qs)} out; "
        f"{len(stats['merges'])} cross-group merges; {stats['within_group_twins']} same-group look-alikes kept apart",
        f"kind: {dict(kinds)}   status: {dict(st)}",
        "topics: " + ", ".join(f"{k} {v}" for k, v in sorted(by_parent.items())),
        f"pictures: {len(bank['images'])} unique; questions with pictures "
        f"{sum(1 for q in qs if q['prompt_images'] or any(o['image'] for o in q['options'] or []))}",
        f"without answer: {sum(1 for q in qs if not q['answer'] and not (q['kind'] == 'mcq' and any(o['correct'] for o in q['options'])))}",
    ]
    return "\n".join(lines)


def load_groups(q_dir: Path) -> dict[str, list]:
    groups = {}
    for p in sorted(q_dir.glob("G*.json")):
        if not re.fullmatch(r"G\d+\.json", p.name):
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            sys.exit(f"{p.name}: not valid JSON ({e}); fix or remove it before merging")
        qs = d.get("questions") if isinstance(d, dict) else None
        if not isinstance(qs, list):
            sys.exit(f"{p.name}: no 'questions' list")
        groups[p.stem] = qs
    return groups


# ── self-test ──────────────────────────────────────────────────────────────

def self_test() -> None:
    png = lambda tag: b"\x89PNG\r\n\x1a\n" + tag.encode() * 8  # noqa: E731
    with tempfile.TemporaryDirectory() as td:
        t = Path(td)
        for name, data in {"a/images/p1.png": png("one"), "b/images/p1copy.png": png("one"),
                           "b/images/p2.png": png("two"), "a/images/empty.png": b""}.items():
            (t / name).parent.mkdir(parents=True, exist_ok=True)
            (t / name).write_bytes(data)

        def q(key, prompt, imgs=(), kind="short", sources=None, used=(), answer=None, opts=None,
              topic="sifaat.ra", status="clean", note=None):
            return {"key": key, "kind": kind, "prompt": prompt, "prompt_images": list(imgs),
                    "options": opts, "select_many": False, "marks": 1, "answer": answer,
                    "topic": topic, "quran_ref": None,
                    "sources": sources or [{"label": "Bank 25/26", "kind": "bank"}],
                    "used_in": list(used), "status": status, "note": note}

        exam_src = [{"label": "EOT2 25/26", "kind": "exam", "number": "A2"}]
        old_src = [{"label": "EOY 23/24", "kind": "exam", "number": "B1"}]
        groups = {
            "G1": [
                q("G1-001", "Is the raa heavy or light here?", ["a/images/p1.png"],
                  sources=exam_src, used=["EOT2 25/26"]),
                q("G1-002", "What rule is present in this ayah?", ["a/images/p1.png"]),
                q("G1-003", "Name a letter of qalqala.", topic="qalqala-letters"),
                q("G1-004", "Missing picture question", ["a/images/nope.png"]),
                q("G1-005", "Empty picture question", ["a/images/empty.png"]),
                q("G1-006", "Which is correct?", kind="mcq", sources=old_src, used=["EOY 23/24"],
                  opts=[{"text": "A", "image": None, "correct": False},
                        {"text": "B", "image": None, "correct": False}], status="check",
                  note="correct option not marked"),
            ],
            "G2": [
                q("G2-001", "Q3. Is the raa  HEAVY or light here? (1 mark)", ["b/images/p1copy.png"],
                  answer="Heavy (1)"),
                q("G2-002", "What rule is present in this ayah?", ["b/images/p2.png"]),
                q("G2-003", "Which is correct?", kind="mcq",
                  opts=[{"text": "B", "image": None, "correct": True},
                        {"text": "A.", "image": None, "correct": False}]),
            ],
        }
        r = merge(groups, t)
        bank, qs = r["bank"], r["bank"]["questions"]
        by_origin = {k: x for x in qs for k in x["origin_keys"]}

        raa = by_origin["G1-001"]
        assert by_origin["G2-001"] is raa, "exam + bank copy of the same question must merge"
        assert raa["prompt"] == "Is the raa heavy or light here?", "exam wording must win"
        assert raa["answer"] == "Heavy (1)", "answer filled from the bank copy"
        assert raa["review_status"] == "check" and "answer taken from" in raa["review_note"]
        assert {s["label"] for s in raa["sources"]} == {"EOT2 25/26", "Bank 25/26"}
        assert raa["used_in"] == ["EOT2 25/26"]
        assert len(raa["prompt_images"]) == 1 and raa["prompt_images"][0].startswith("bank/")

        a, b = by_origin["G1-002"], by_origin["G2-002"]
        assert a is not b, "same wording about a different picture must NOT merge"

        mcq = by_origin["G1-006"]
        assert by_origin["G2-003"] is mcq, "same options in another order must merge"
        assert [o["correct"] for o in mcq["options"]] == [False, True], "correct flags from the loser"
        assert mcq["review_status"] == "check"

        assert by_origin["G1-003"]["topic_id"] == "intro.tajweed" or by_origin["G1-003"]["topic_id"].startswith("sifaat")
        assert by_origin["G1-003"]["review_status"] == "check"
        miss = by_origin["G1-004"]
        assert miss["prompt_images"] == [] and "picture file missing" in miss["review_note"]
        assert "picture file empty" in by_origin["G1-005"]["review_note"]

        # identical picture in two folders → one storage object
        assert len(bank["images"]) == 2, bank["images"].keys()

        # keys stable when the group numbering / order changes
        swapped = merge({"G9": groups["G2"], "G0": groups["G1"]}, t)["bank"]["questions"]
        assert sorted(x["import_key"] for x in qs) == sorted(x["import_key"] for x in swapped)
        again = merge(groups, t)["bank"]["questions"]
        assert [x["import_key"] for x in qs] == [x["import_key"] for x in again]

        # near-identical long prompts merge; short generic ones about no picture don't
        long_a = "Explain why the letter raa is read heavy in this word when it has a sukoon"
        long_b = "Explain why the letter raa is read heavy in this word when it has a sukun"
        short_a, short_b = "Name the rule here", "Name the rules here"
        r2 = merge({"G1": [q("G1-001", long_a), q("G1-002", short_a)],
                    "G2": [q("G2-001", long_b), q("G2-002", short_b)]}, t)
        assert len(r2["bank"]["questions"]) == 3, [x["prompt"] for x in r2["bank"]["questions"]]

        # same-group exact twins stay separate and get distinct keys
        r3 = merge({"G1": [q("G1-001", "Same?"), q("G1-002", "Same?")]}, t)["bank"]["questions"]
        assert sorted(x["import_key"][-2:] for x in r3)[0] == "-2" or len({x["import_key"] for x in r3}) == 2
        assert len({x["import_key"] for x in r3}) == 2

        # season: 25/26 exam beats 23/24 exam
        r4 = merge({"G1": [q("G1-001", "Older wording of this question", sources=old_src, used=["EOY 23/24"])],
                    "G2": [q("G2-001", "Older wording of this question.", sources=exam_src, used=["EOT2 25/26"])]}, t)
        w = r4["bank"]["questions"][0]
        assert w["origin_keys"][0] == "G2-001" and w["used_in"] == ["EOT2 25/26", "EOY 23/24"]
        assert season_of("Season 3 EOY") == 23 and season_of("EOT2 25/26") == 25
        assert norm_text("Q12. ٱلرَّحْمَـٰنِ (2 marks)") == norm_text("الرحمن")

        # routine reasons alone do not flag a question; real doubts still do
        def status_of(note):
            one = q("G1-001", f"Routine test {note}", status="check", note=note)
            return merge({"G1": [one]}, t)["bank"]["questions"][0]
        r = status_of("marks not stated")
        assert r["review_status"] == "clean" and r["review_note"] == "marks not stated"
        assert status_of("marks not stated; no answer in source")["review_status"] == "clean"
        assert status_of("Marks not stated.")["review_status"] == "clean"
        assert status_of("Seerah 3 | source highlight: green")["review_status"] == "clean"
        assert status_of("marks not stated (bank only; not verifiable)")["review_status"] == "clean"
        assert status_of("no answer in source; picture may belong to next question")["review_status"] == "check"
        assert status_of("correct option not marked in mark scheme")["review_status"] == "check"
        assert status_of("no answer in source (the sisters' form Q3 keys 'To merge')")["review_status"] == "check"
        assert status_of("marks not stated and answer has no per-point marks")["review_status"] == "check"
        # a routine-only question that needed a validation fix stays check
        bad = q("G1-001", "Routine but broken", status="check", note="marks not stated", topic="nonsense")
        assert merge({"G1": [bad]}, t)["bank"]["questions"][0]["review_status"] == "check"
    print("self-test: all assertions passed")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("q_dir", nargs="?")
    ap.add_argument("t_dir", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--report")
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test()
        return
    if not (a.q_dir and a.t_dir and a.out):
        ap.error("Q dir, T dir and output path are required")
    q_dir, t_dir = Path(a.q_dir), Path(a.t_dir)
    groups = load_groups(q_dir)
    if not groups:
        sys.exit(f"no G*.json in {q_dir}")
    r = merge(groups, t_dir)
    out = Path(a.out)
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text(json.dumps(r["bank"], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(out)
    if a.report:
        Path(a.report).write_text(report(r["bank"], r["stats"]), encoding="utf-8")
    print(summary(r["bank"], r["stats"]))
    print(f"wrote {out}" + (f" and {a.report}" if a.report else ""))


if __name__ == "__main__":
    main()
