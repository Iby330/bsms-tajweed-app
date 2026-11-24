/**
 * Turning the bank's pictures of Qur'an words into typeset refs: the pure
 * part, shared by `execution/exam_bank_ayah_plan.ts` (which reads the mapping
 * and the live rows and writes the files) and its tests.
 *
 * Two outputs from one mapping (brainstorms/exam-ayah-typeset-2026-11-24/
 * mapping.jsonl, one line per picture):
 *
 *  - `buildProposals`: per bank row, the ref each picture slot (the prompt, or
 *    an option found by its picture) should carry. Shipped with the app as
 *    ayah-proposals.json: the owner's comparison page reads it to say which
 *    slots need a look, and to put a ref back after "Keep the picture".
 *  - `buildAyahPlan`: a change plan in the format
 *    `execution/exam_bank_apply_audit.ts` applies (compare-and-set per row),
 *    plus its revert plan. Only `safe` slots are planned; pictures are never
 *    touched, so clearing a ref brings the picture straight back.
 *
 * Relative imports only: tsx runs the execution script outside Next.
 */
import { parseQuranRef } from "./parse";
import type { QuranCircle, QuranRef } from "./types";

export type MappingRef = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  from_word: number | null;
  to_word: number | null;
};

export type MappingLine = {
  image: string;
  used_by: { row_id: string; where: string }[];
  match: "exact" | "unsure" | "not_quran" | string;
  ref: MappingRef | null;
  /** The picture shows the ayah's end marker. */
  includes_ayah_end: boolean;
  differs_from_db: string;
  swap: "safe" | "needs_emphasis" | "owner_check" | "keep_picture" | string;
  note: string;
};

/** safe: planned. owner_check / emphasis: offered on the comparison page, never planned. */
export type ProposalStatus = "safe" | "owner_check" | "emphasis";

/** What one picture slot should show: the ref, and why the owner might look twice. */
export type SlotProposal = {
  images: string[];
  ref: QuranRef;
  status: ProposalStatus;
  /** Plain-English reasons to look closely; empty when there are none. */
  look: string[];
};

export type OptionProposal = SlotProposal & { /** 1-based, as the mapping found it. */ number: number };

/**
 * A picture that is not the Qur'an at all (a slide title): the term goes into
 * the question's wording and the picture stops showing. `prompt` is the new
 * wording, or null when the wording already has the term.
 */
export type TermProposal = {
  images: string[];
  term: string;
  prompt: string | null;
  /** The wording `prompt` replaces; any other wording lacking the term is someone's edit, and is skipped. */
  prompt_was: string | null;
  look: string[];
};

export type RowProposals = {
  prompt?: SlotProposal;
  term?: TermProposal;
  /** By the option's picture path. */
  options?: Record<string, OptionProposal>;
};

export type Proposals = Record<string, RowProposals>;

export type Skip = { row_id: string; slot: string; images: string[]; reason: string };

/**
 * The owner's call on a picture the mapping could not clear by itself, by
 * picture path: plan it after all (`safe`), with the basmala above or a
 * circle round a letter; or, for a picture that is not the Qur'an, the term
 * to type instead (`term`, and `prompt` to use when the wording lacks it).
 */
export type OwnerDecision = {
  safe?: true;
  basmala?: true;
  circle?: QuranCircle;
  term?: string;
  prompt?: string;
  promptWas?: string;
  /** What the owner decided, in plain English, shown on the comparison page. */
  why: string;
};
export type OwnerDecisions = Record<string, OwnerDecision>;

/** "54:3" → the word_position of that ayah's end marker. */
export type EndPositions = Record<string, number>;

export const LOOK_UNSURE =
  "These words are found in more than one place in the Qur'an. The picture does not say which, so no surah or ayah number is shown with them.";

export const LOOK_EMPHASIS =
  "The picture circles one letter for the question. The typeset words draw the circle again: check it sits on the same letter.";

export const LOOK_TERM =
  "Not the Qur'an: the picture was a slide title. The term is typed into the question instead, in the app's own Arabic lettering.";

/** The mapping's notes, made readable for a teacher: no dashes, no "DB". */
const plain = (s: string) =>
  s.replace(/\s*[—–]\s*/g, ", ").replace(/\bDB\b/g, "the app's text").replace(/^OWNER CHECK:\s*/i, "Check before using: ").trim();

/** The mapping's ref as the app stores one: no null word bounds, and the end
 *  marker included when the picture shows it (to_word names the last word). */
export function proposalRef(line: Pick<MappingLine, "ref" | "includes_ayah_end">, ends: EndPositions): QuranRef | null {
  const m = line.ref;
  if (!m) return null;
  const ref: QuranRef = { surah: m.surah, from_ayah: m.from_ayah, to_ayah: m.to_ayah };
  if (m.from_word != null) ref.from_word = m.from_word;
  if (m.to_word != null) {
    const end = ends[`${m.surah}:${m.to_ayah}`];
    ref.to_word = line.includes_ayah_end && end === m.to_word + 1 ? end : m.to_word;
  }
  return parseQuranRef(ref);
}

/** Every key a word-range ref ending on its ayah's last word may need: "s:a". */
export function endKeysNeeded(lines: MappingLine[]): string[] {
  const keys = lines.filter((l) => l.ref && l.ref.to_word != null && l.includes_ayah_end).map((l) => `${l.ref!.surah}:${l.ref!.to_ayah}`);
  return [...new Set(keys)];
}

function lookFor(lines: MappingLine[], decisions: OwnerDecisions): string[] {
  const out: string[] = [];
  for (const l of lines) if (decisions[l.image]) out.push(`Owner's decision: ${decisions[l.image].why}`);
  if (lines.some((l) => l.match === "unsure")) out.push(LOOK_UNSURE);
  if (lines.some((l) => l.swap === "needs_emphasis")) out.push(LOOK_EMPHASIS);
  for (const l of lines) if (l.differs_from_db.trim()) out.push(`Picture and typeset words differ: ${plain(l.differs_from_db)}.`.replace(/\.\.$/, "."));
  for (const l of lines) if (l.swap === "owner_check" && l.note.trim()) out.push(plain(l.note));
  return [...new Set(out)];
}

/** Several pictures under one prompt as one range: same surah, each ayah running on from the last. */
function joinRefs(refs: QuranRef[]): QuranRef | null {
  const sorted = [...refs].sort((a, b) => a.from_ayah - b.from_ayah);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (next.surah !== prev.surah || next.from_ayah !== prev.to_ayah + 1) return null;
    if (prev.to_word != null || next.from_word != null) return null;
  }
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const ref: QuranRef = { surah: first.surah, from_ayah: first.from_ayah, to_ayah: last.to_ayah };
  if (first.from_word != null) ref.from_word = first.from_word;
  if (last.to_word != null) ref.to_word = last.to_word;
  return ref;
}

const PROPOSABLE = new Set(["safe", "owner_check", "needs_emphasis"]);

/** Per row and slot, the ref to set (safe) or to offer the owner (owner_check). */
export function buildProposals(
  lines: MappingLine[],
  ends: EndPositions,
  decisions: OwnerDecisions = {},
): { proposals: Proposals; skipped: Skip[] } {
  const groups = new Map<string, { row: string; where: string; lines: MappingLine[] }>();
  for (const l of lines) {
    for (const u of l.used_by) {
      const key = `${u.row_id}|${u.where}`;
      const g = groups.get(key) ?? { row: u.row_id, where: u.where, lines: [] };
      g.lines.push(l);
      groups.set(key, g);
    }
  }

  const proposals: Proposals = {};
  const skipped: Skip[] = [];
  for (const g of groups.values()) {
    const images = g.lines.map((l) => l.image);
    const skip = (reason: string) => skipped.push({ row_id: g.row, slot: g.where, images, reason });
    const decided = g.lines.map((l) => decisions[l.image]).filter(Boolean);
    const term = decided.find((d) => d.term);
    if (term && g.where === "prompt" && g.lines.length === 1) {
      (proposals[g.row] ??= {}).term = {
        images, term: term.term!, prompt: term.prompt ?? null, prompt_was: term.promptWas ?? null, look: [LOOK_TERM, ...lookFor(g.lines, decisions)],
      };
      continue;
    }
    const bad = g.lines.find((l) => !PROPOSABLE.has(l.swap) || !l.ref);
    if (bad) { skip(`swap: ${bad.swap}${bad.ref ? "" : ", no ref"}`); continue; }
    const refs = g.lines.map((l) => proposalRef(l, ends));
    if (refs.some((r) => !r)) { skip("ref not valid"); continue; }
    const joined = refs.length === 1 ? refs[0] : joinRefs(refs as QuranRef[]);
    if (!joined) { skip("pictures do not make one running range"); continue; }
    const ref: QuranRef = { ...joined };
    for (const d of decided) {
      if (d.basmala) ref.basmala = true;
      if (d.circle) ref.circle = { ...d.circle };
    }
    const cleared = g.lines.every((l) => l.swap === "safe" || decisions[l.image]?.safe);
    const status: ProposalStatus = cleared
      ? "safe"
      : g.lines.some((l) => l.swap === "needs_emphasis") ? "emphasis" : "owner_check";
    const proposal: SlotProposal = { images, ref, status, look: lookFor(g.lines, decisions) };
    const row = (proposals[g.row] ??= {});
    const option = /^option (\d+)$/.exec(g.where);
    if (g.where === "prompt") {
      proposal.images = [...images].sort();
      row.prompt = proposal;
    } else if (option && images.length === 1) {
      (row.options ??= {})[images[0]] = { ...proposal, number: Number(option[1]) };
    } else {
      skip(`unknown slot ${g.where}`);
    }
  }
  return { proposals, skipped };
}

// ── the change plan ─────────────────────────────────────────────────────────

export type CurrentRow = {
  id: string;
  /** For a paper item: the bank row it was copied from (its proposals' key). */
  bank_question_id?: string | null;
  /** For a paper item: which paper, for the report. */
  label?: string;
  prompt: string;
  archived: boolean;
  prompt_images: string[] | null;
  prompt_quran: unknown;
  options: unknown;
};

export type PlanOp = {
  entry_id: string;
  row_id: string;
  field: "prompt_quran" | "options" | "prompt" | "prompt_images";
  old: unknown;
  new: unknown;
  reason: string;
};
export type PlanEntry = { entry_id: string; bucket: string; question: string; ops: PlanOp[] };
export type PlanTable = "exam_bank_questions" | "exam_paper_items";

export type Plan = {
  generated_at: string;
  based_on: string;
  table: PlanTable;
  apply_with: string;
  kind: "forward" | "revert";
  reverts?: string;
  entries: PlanEntry[];
  skipped: Skip[];
};

export type PlanStats = {
  rows: number;
  archivedRows: number;
  promptSet: number;
  promptReplaced: number;
  optionSlots: number;
  /** Options found by picture at a different place than the mapping's number. */
  movedOptions: number;
  alreadySet: number;
  /** Slide-title pictures replaced by the term typed into the question. */
  terms: number;
  /** Slots the owner must decide on whose existing ref is cleared, so the picture keeps showing. */
  keptPictures: number;
};

function canon(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== null).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
}
const sameRef = (a: unknown, b: QuranRef) => canon(parseQuranRef(a)) === canon(b);

export const refText = (r: QuranRef) =>
  `${r.surah}:${r.from_ayah}${r.to_ayah !== r.from_ayah ? `-${r.to_ayah}` : ""}${r.from_word != null || r.to_word != null ? ` words ${r.from_word ?? 1}-${r.to_word ?? "end"}` : ""}`;

/**
 * The forward and revert plans for every `safe` proposal, against the rows
 * as they are now. A slot the owner must decide on (owner_check, emphasis)
 * that already carries a ref has it cleared: a ref now wins over the
 * picture, and the picture is what was checked. A prompt is set only when its pictures are still exactly
 * the mapped ones; an option is found by its picture. Archived rows are
 * included so nothing diverges if one is restored.
 */
export function buildAyahPlan(
  proposals: Proposals,
  rows: CurrentRow[],
  generatedAt: string,
  basedOn = "mapping.jsonl + live rows",
  /**
   * exam_paper_items: each row is a paper's COPY of a bank row, keyed to its
   * proposals by `bank_question_id`. A slot is planned only where the copy's
   * picture is still the bank's (a teacher may have edited it); the rest are
   * skipped and reported. Rows not mapped are ignored.
   */
  table: PlanTable = "exam_bank_questions",
  fileName = "change-plan-ayahs.json",
): { plan: Plan; revert: Plan; skipped: Skip[]; stats: PlanStats } {
  const items = table === "exam_paper_items";
  const skipped: Skip[] = [];
  const entries: PlanEntry[] = [];
  const stats: PlanStats = { rows: 0, archivedRows: 0, promptSet: 0, promptReplaced: 0, optionSlots: 0, movedOptions: 0, alreadySet: 0, keptPictures: 0, terms: 0 };
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (!items) {
    for (const [rowId, p] of Object.entries(proposals)) {
      if (byId.has(rowId)) continue;
      const all = [...(p.prompt ? [p.prompt] : []), ...Object.values(p.options ?? {})].filter((s) => s.status === "safe");
      for (const s of all) skipped.push({ row_id: rowId, slot: "row", images: s.images, reason: "row not in the bank any more" });
    }
  }
  const edited = items ? " (the copy was edited: its picture is not the bank's)" : "";

  for (const row of rows) {
    const rowId = row.id;
    const p = proposals[items ? (row.bank_question_id ?? "") : rowId];
    if (!p) continue;
    const id = `${items ? "P" : "T"}${String(entries.length + 1).padStart(3, "0")}`;
    const ops: PlanOp[] = [];

    if (p.term) {
      const want = p.term;
      const now = (row.prompt_images ?? []).filter(Boolean);
      if (now.length === 0) {
        stats.alreadySet++;
      } else if (canon([...now].sort()) !== canon([...want.images].sort())) {
        skipped.push({ row_id: rowId, slot: "prompt", images: want.images, reason: `prompt pictures changed since the mapping (now ${now.length})${edited}` });
      } else if (!row.prompt.includes(want.term) && (!want.prompt || row.prompt.trim() !== want.prompt_was)) {
        skipped.push({ row_id: rowId, slot: "prompt", images: want.images, reason: `the wording lacks ${want.term} and is not the wording the decision replaces${edited}` });
      } else {
        stats.terms++;
        if (!row.prompt.includes(want.term)) {
          ops.push({ entry_id: id, row_id: rowId, field: "prompt", old: row.prompt, new: want.prompt, reason: `type the term ${want.term} into the question` });
        }
        ops.push({
          entry_id: id, row_id: rowId, field: "prompt_images", old: row.prompt_images, new: [],
          reason: `the picture was a slide title, not the Qur'an: the question shows the typed term ${want.term}`,
        });
      }
    }

    if (p.prompt) {
      const want = p.prompt;
      const now = [...(row.prompt_images ?? []).filter(Boolean)].sort();
      const was = parseQuranRef(row.prompt_quran);
      if (canon(now) !== canon(want.images)) {
        if (want.status === "safe") {
          skipped.push({ row_id: rowId, slot: "prompt", images: want.images, reason: `prompt pictures changed since the mapping (now ${now.length})${edited}` });
        }
      } else if (want.status !== "safe") {
        // A ref now wins over the picture: a slot the owner must decide on
        // keeps its picture until they do.
        if (was) {
          stats.keptPictures++;
          ops.push({
            entry_id: id, row_id: rowId, field: "prompt_quran", old: row.prompt_quran, new: null,
            reason: `keep the picture (${want.status}): clears ${refText(was)}; the comparison page can put it back`,
          });
        }
      } else if (sameRef(row.prompt_quran, want.ref)) {
        stats.alreadySet++;
      } else {
        if (was) stats.promptReplaced++;
        else stats.promptSet++;
        ops.push({
          entry_id: id, row_id: rowId, field: "prompt_quran", old: row.prompt_quran ?? null, new: want.ref,
          reason: `typeset the prompt as ${refText(want.ref)}${was ? ` (replaces ${refText(was)})` : ""}`,
        });
      }
    }

    const optionWants = Object.entries(p.options ?? {});
    if (optionWants.length > 0) {
      const raw = Array.isArray(row.options) ? (row.options as Record<string, unknown>[]) : null;
      const next = raw ? raw.map((o) => ({ ...o })) : null;
      const notes: string[] = [];
      for (const [path, want] of optionWants) {
        const at = next ? next.map((o, i) => (o && o.image === path ? i : -1)).filter((i) => i >= 0) : [];
        if (!next || at.length === 0) {
          if (want.status === "safe") {
            skipped.push({ row_id: rowId, slot: `option ${want.number}`, images: [path], reason: `no option has the picture any more${edited}` });
          }
          continue;
        }
        const i = at.includes(want.number - 1) ? want.number - 1 : at[0];
        if (want.status !== "safe") {
          if (parseQuranRef(next[i].quran)) {
            const { quran: _drop, ...rest } = next[i];
            void _drop;
            next[i] = rest;
            stats.keptPictures++;
            notes.push(`keep the picture in option ${i + 1} (${want.status})`);
          }
          continue;
        }
        if (i !== want.number - 1) stats.movedOptions++;
        if (sameRef(next[i].quran, want.ref)) { stats.alreadySet++; continue; }
        next[i] = { ...next[i], quran: want.ref };
        stats.optionSlots++;
        notes.push(`option ${i + 1} as ${refText(want.ref)}`);
      }
      if (notes.length > 0) {
        ops.push({ entry_id: id, row_id: rowId, field: "options", old: raw, new: next, reason: `typeset ${notes.join("; ")}` });
      }
    }

    if (ops.length === 0) continue;
    stats.rows++;
    if (row.archived) stats.archivedRows++;
    const words = row.prompt.replace(/\s+/g, " ").trim();
    const tag = items ? `item ${rowId.slice(0, 8)} of bank ${String(row.bank_question_id).slice(0, 8)}${row.label ? `, ${row.label}` : ""}` : rowId.slice(0, 8);
    entries.push({
      entry_id: id,
      bucket: items ? "ayah_typeset_paper_copy" : row.archived ? "ayah_typeset_archived" : "ayah_typeset",
      question: `${words.length > 70 ? `${words.slice(0, 70)}…` : words} [${tag}]`,
      ops,
    });
  }

  const head = {
    generated_at: generatedAt,
    based_on: basedOn,
    table,
    apply_with: "npx tsx execution/exam_bank_apply_audit.ts <this file> [--apply]",
  };
  const plan: Plan = { ...head, kind: "forward", entries, skipped };
  const revert: Plan = {
    ...head,
    kind: "revert",
    reverts: fileName,
    skipped: [],
    entries: [...entries].reverse().map((e) => ({
      ...e,
      ops: [...e.ops].reverse().map((o) => ({ ...o, old: o.new, new: o.old, reason: `revert: ${o.reason}` })),
    })),
  };
  return { plan, revert, skipped, stats };
}
