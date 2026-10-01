import { DETAILS, type Category } from "./mistake-taxonomy";
import type { MistakeRow } from "./mistakes";

/**
 * The mistakes board's arithmetic: every mark a student has, from teacher
 * hearings and partner revision alike, turned into the board's parts. Pure,
 * so the board's components only draw.
 *
 * Marks may be mixed here, but never anonymously: every row and every
 * session carries its source, and each count that mixes them can say how
 * many came from whom.
 */

export type Source = "teacher" | "partner";
export type SourceFilter = Source | "all";

/** A submitted session, oldest or newest first as the caller likes. */
export type BoardSession = { id: string; source: Source; at: string };
export type BoardMark = MistakeRow & { source: Source };
export type Board = { sessions: BoardSession[]; marks: BoardMark[] };

/** The switch's URL value: teacher or partner, anything else is all. */
export function parseSource(raw: string | undefined): SourceFilter {
  return raw === "teacher" || raw === "partner" ? raw : "all";
}

export function pickSource(board: Board, source: SourceFilter): Board {
  if (source === "all") return board;
  return {
    sessions: board.sessions.filter((s) => s.source === source),
    marks: board.marks.filter((m) => m.source === source),
  };
}

/** Who logged a chip's marks: "teacher", "partner", or both counted. */
export function who(teacher: number, partner: number): string {
  if (teacher && partner) return `${teacher} teacher, ${partner} partner`;
  return teacher ? "teacher" : "partner";
}

export type Slice = { id: string | null; label: string; count: number };

const NOT_SPECIFIED = "Not specified";
// The picker's long label explains the rule to the person logging; the board
// only needs to name it.
const shortLabel = (label: string) => label.replace(/\s*\(.*\)$/, "");

function countBy<T>(items: T[], key: (t: T) => string | null): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const it of items) out.set(key(it), (out.get(key(it)) ?? 0) + 1);
  return out;
}

/** Hifdh slips — forgot, swapped, added — in taxonomy order. Only slices
 *  with marks: this feeds a split bar, where an empty slice is invisible. */
export function hifdhSplit(marks: BoardMark[]): { total: number; slices: Slice[] } {
  const hifz = marks.filter((m) => m.category === "hifz");
  const counts = countBy(hifz, (m) => m.detail);
  const slices: Slice[] = DETAILS.hifz
    .map((d) => ({ id: d.id, label: d.label, count: counts.get(d.id) ?? 0 }))
    .filter((s) => s.count > 0);
  const known = new Set(DETAILS.hifz.map((d) => d.id));
  const other = hifz.filter((m) => !m.detail || !known.has(m.detail)).length;
  if (other) slices.push({ id: null, label: NOT_SPECIFIED, count: other });
  return { total: hifz.length, slices };
}

/** Every tajweed rule in taxonomy order, unused ones at zero: a rule never
 *  marked is worth seeing too. */
export function tajweedByRule(marks: BoardMark[]): { total: number; rules: Slice[] } {
  const taj = marks.filter((m) => m.category === "tajweed");
  const counts = countBy(taj, (m) => m.detail);
  const rules: Slice[] = DETAILS.tajweed.map((d) => ({
    id: d.id, label: shortLabel(d.label), count: counts.get(d.id) ?? 0,
  }));
  const known = new Set(DETAILS.tajweed.map((d) => d.id));
  const other = taj.filter((m) => !m.detail || !known.has(m.detail)).length;
  if (other) rules.push({ id: null, label: NOT_SPECIFIED, count: other });
  return { total: taj.length, rules };
}

/** The 28 letters in alphabet order — the makhraj grid's cells. */
export const MAKHRAJ_LETTERS = "ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي".split(" ");

/** Makhraj marks by letter. A marked letter outside the 28 (hamza, say)
 *  gets a cell of its own after them rather than going uncounted. */
export function makhrajByLetter(marks: BoardMark[]): {
  total: number; counts: Record<string, number>; letters: string[];
} {
  const mk = marks.filter((m) => m.category === "makhraj" && m.detail);
  const counts: Record<string, number> = {};
  for (const m of mk) counts[m.detail!] = (counts[m.detail!] ?? 0) + 1;
  const extra = Object.keys(counts).filter((l) => !MAKHRAJ_LETTERS.includes(l));
  return { total: mk.length, counts, letters: [...MAKHRAJ_LETTERS, ...extra] };
}

export type SessionColumn = {
  id: string; source: Source; at: string;
  hifz: number; tajweed: number; makhraj: number; total: number;
};

/** The last `limit` sessions, oldest first, each split by category. A clean
 *  session stays in at zero: a partner session with nothing to mark is news. */
export function bySession(board: Board, limit = 12): SessionColumn[] {
  const recent = [...board.sessions].sort((a, b) => a.at.localeCompare(b.at)).slice(-limit);
  const cols = new Map(recent.map((s) => [s.id, {
    id: s.id, source: s.source, at: s.at, hifz: 0, tajweed: 0, makhraj: 0, total: 0,
  } as SessionColumn]));
  for (const m of board.marks) {
    const c = cols.get(m.session_id);
    if (!c || !(m.category in c)) continue;
    c[m.category as Category] += 1;
    c.total += 1;
  }
  return [...cols.values()];
}

export type SurahCount = { surah: number; count: number };

/** Surahs by mistakes, most first. Ties go in run order — An-Nas first,
 *  which is the higher surah number. */
export function bySurah(marks: BoardMark[]): SurahCount[] {
  const counts = countBy(marks, (m) => String(m.surah_number));
  return [...counts.entries()]
    .map(([s, count]) => ({ surah: Number(s), count }))
    .sort((a, b) => b.count - a.count || b.surah - a.surah);
}

export type DrillChip = {
  category: Category; detail: string | null; label: string; teacher: number; partner: number;
};
export type DrillAyah = {
  surah: number;
  ayah: number;
  count: number;
  chips: DrillChip[];
  /** word position → the category most marked on it, for the underline */
  words: Record<number, Category>;
  /** a slip logged against the whole ayah rather than one word */
  wholeAyah: boolean;
  sessionIds: string[];
  latest: string;
};

const CATEGORY_ORDER: Category[] = ["hifz", "tajweed", "makhraj"];

function chipLabel(category: Category, detail: string | null): string {
  if (category === "makhraj") return detail ? `Makhraj of ${detail}` : "Makhraj";
  const d = DETAILS[category].find((x) => x.id === detail);
  return d ? shortLabel(d.label) : category === "hifz" ? "Hifdh" : "Tajweed";
}

/** The ayahs with the most mistakes, hottest first: what went wrong (and
 *  who said so), which words, and which sessions it came up in. Ties break on
 *  how many sessions it came up in, then on the most recent mark. */
export function ayahsToDrill(marks: BoardMark[]): DrillAyah[] {
  const byAyah = new Map<string, BoardMark[]>();
  for (const m of marks) {
    const k = `${m.surah_number}:${m.ayah_number}`;
    (byAyah.get(k) ?? byAyah.set(k, []).get(k)!).push(m);
  }
  const out: DrillAyah[] = [];
  for (const group of byAyah.values()) {
    const chips = new Map<string, DrillChip>();
    const perWord = new Map<number, Map<Category, number>>();
    for (const m of group) {
      const k = `${m.category}|${m.detail ?? ""}`;
      const chip = chips.get(k) ?? chips.set(k, {
        category: m.category, detail: m.detail, label: chipLabel(m.category, m.detail), teacher: 0, partner: 0,
      }).get(k)!;
      chip[m.source] += 1;
      if (m.word_position !== null) {
        const w = perWord.get(m.word_position) ?? perWord.set(m.word_position, new Map()).get(m.word_position)!;
        w.set(m.category, (w.get(m.category) ?? 0) + 1);
      }
    }
    const words: Record<number, Category> = {};
    for (const [pos, cats] of perWord) {
      words[pos] = [...cats.entries()].sort(
        (a, b) => b[1] - a[1] || CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
      )[0][0];
    }
    out.push({
      surah: group[0].surah_number,
      ayah: group[0].ayah_number,
      count: group.length,
      chips: [...chips.values()].sort(
        (a, b) => b.teacher + b.partner - (a.teacher + a.partner)
          || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      ),
      words,
      wholeAyah: group.some((m) => m.word_position === null),
      sessionIds: [...new Set(group.map((m) => m.session_id))],
      latest: group.reduce((l, m) => (m.created_at > l ? m.created_at : l), group[0].created_at),
    });
  }
  return out.sort((a, b) =>
    b.count - a.count || b.sessionIds.length - a.sessionIds.length || b.latest.localeCompare(a.latest));
}
