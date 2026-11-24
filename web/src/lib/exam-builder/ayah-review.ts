/**
 * The owner's comparison page (/teacher/exam-builder/review/ayahs): which
 * bank questions to show, and for each picture slot what it shows now beside
 * what was proposed. Pure, so it is tested without a database.
 *
 * A slot is the question's own Arabic ("prompt"), a slide title replaced by
 * its typed term ("term"), or one option (by its picture path). A slot is
 * "typeset" when its ref is set (or, for a term, when the picture is off);
 * "Keep the picture" turns that off and "Use the typeset words" puts the
 * proposed ref back (bank-actions `setAyahSlot`).
 */
import type { Proposals } from "./ayah-plan";
import { parseOptions } from "./parse";
import type { BankQuestion, McqOption, QuranRef } from "./types";

export type SlotKey = "prompt" | "term" | `option:${string}`;

export type AyahSlot = {
  key: SlotKey;
  /** "Under the question", "Option 3", "The term in the question". */
  label: string;
  /** The picture(s) the slot had: the original, always kept. */
  images: string[];
  /** The ref the slot carries now (null: the picture shows). */
  ref: QuranRef | null;
  /** The ref "Use the typeset words" restores, when there is one. */
  proposed: QuranRef | null;
  /** For a term slot: the term typed into the question. */
  term?: string;
  /** Typeset words (or the typed term) show in place of the picture. */
  typeset: boolean;
  /** Plain-English reasons to look closely. */
  look: string[];
};

export type AyahEntry = { question: BankQuestion; slots: AyahSlot[]; needsLook: boolean; kept: boolean };

export type AyahFilter = "all" | "look" | "kept";

/** The slots of one question worth comparing, in reading order: its Arabic, then its options. */
export function ayahSlots(q: BankQuestion, proposals: Proposals): AyahSlot[] {
  const p = proposals[q.id];
  const slots: AyahSlot[] = [];
  const pictures = q.prompt_images.filter(Boolean);

  if (p?.term) {
    const off = !p.term.images.some((img) => pictures.includes(img));
    slots.push({
      key: "term", label: "The term in the question", images: p.term.images, ref: null, proposed: null,
      term: p.term.term, typeset: off, look: p.term.look,
    });
  } else if (p?.prompt || (pictures.length > 0 && q.prompt_quran)) {
    const images = pictures.length > 0 ? pictures : (p?.prompt?.images ?? []);
    slots.push({
      key: "prompt", label: "Under the question", images, ref: q.prompt_quran, proposed: p?.prompt?.ref ?? null,
      typeset: !!q.prompt_quran, look: p?.prompt?.look ?? [],
    });
  }

  (q.options ?? []).forEach((o, i) => {
    if (!o.image) return;
    const proposal = p?.options?.[o.image];
    if (!proposal && !o.quran) return;
    slots.push({
      key: `option:${o.image}`, label: `Option ${i + 1}`, images: [o.image], ref: o.quran ?? null,
      proposed: proposal?.ref ?? null, typeset: !!o.quran, look: proposal?.look ?? [],
    });
  });
  return slots;
}

/** Every question with a picture and a ref (or a proposal) on its Arabic or an option. */
export function ayahEntries(questions: BankQuestion[], proposals: Proposals): AyahEntry[] {
  const out: AyahEntry[] = [];
  for (const q of questions) {
    const slots = ayahSlots(q, proposals);
    if (slots.length === 0) continue;
    out.push({
      question: q,
      slots,
      needsLook: slots.some((s) => s.look.length > 0),
      kept: slots.some((s) => !s.typeset),
    });
  }
  return out;
}

export function filterEntries(entries: AyahEntry[], filter: AyahFilter): AyahEntry[] {
  if (filter === "look") return entries.filter((e) => e.needsLook);
  if (filter === "kept") return entries.filter((e) => e.kept);
  return entries;
}

type SlotRow = { prompt_images: string[] | null; prompt_quran: unknown; options: unknown };
export type SlotUpdate = { prompt_quran?: QuranRef | null; options?: McqOption[]; prompt_images?: string[] };

/**
 * What "Keep the picture" (`use: false`) or "Use the typeset words"
 * (`use: true`) writes to one slot of a bank row as it is now. Pictures are
 * never removed here except a slide title's (whose term is in the wording),
 * and a ref comes back only from the proposals.
 */
export function slotChoice(row: SlotRow, key: SlotKey, use: boolean, proposals: Proposals, rowId: string): { ok: true; update: SlotUpdate } | { ok: false; error: string } {
  const p = proposals[rowId];
  const pictures = (row.prompt_images ?? []).filter(Boolean);
  if (key === "prompt") {
    if (!use) {
      if (pictures.length === 0) return { ok: false, error: "This question has no picture to go back to." };
      return { ok: true, update: { prompt_quran: null } };
    }
    if (!p?.prompt) return { ok: false, error: "There are no typeset words on record for this question." };
    return { ok: true, update: { prompt_quran: p.prompt.ref } };
  }
  if (key === "term") {
    if (!p?.term) return { ok: false, error: "There is no typed term on record for this question." };
    const others = pictures.filter((img) => !p.term!.images.includes(img));
    return { ok: true, update: { prompt_images: use ? others : [...others, ...p.term.images] } };
  }
  const path = key.slice("option:".length);
  const options = parseOptions(row.options);
  const i = options?.findIndex((o) => o.image === path) ?? -1;
  if (!options || i < 0) return { ok: false, error: "That option's picture is not in the question any more." };
  if (use) {
    const proposed = p?.options?.[path]?.ref;
    if (!proposed) return { ok: false, error: "There are no typeset words on record for this option." };
    options[i] = { ...options[i], quran: proposed };
  } else {
    const { quran: _off, ...rest } = options[i];
    void _off;
    options[i] = rest;
  }
  return { ok: true, update: { options } };
}
