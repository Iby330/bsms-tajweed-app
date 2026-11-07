/**
 * "Find the rules in this surah" questions — pure, no IO.
 *
 * Tap-the-letters asks for one rule. Here the student works over a whole surah
 * and says which rule, of several, sits on each letter they tap. Still the
 * `checkbox` shape and still a `{selected:[…]}` answer: one option per LETTER
 * AND RULE, labelled `H:surah:ayah:word:letter:rule`, so every letter offers
 * every rule and the options themselves give nothing away.
 *
 * The key is two fields, which the student RPC holds back until the paper is
 * approved (0094, 0138):
 *
 *   correct  tagging this is not a mistake
 *   inst     this letter is part of one thing to find, named by this id
 *
 * Two things a plain right-or-wrong tick cannot say follow from that. A correct
 * option with no `inst` is accepted but not asked for: a hams letter other than
 * the ت the class has covered earns nothing and costs nothing. And an `inst`
 * shared by several options is one thing found any of several ways: a lām
 * shamsiyyah counts on the ال or on the letter after it, once.
 */

export type HuntOption = {
  position: number;
  label: string;
  value?: string;
  correct?: boolean;
  inst?: string | null;
};

export const HUNT_RULES = [
  { id: "ghunnah", name: "Ghunnah" },
  { id: "lam_shamsi", name: "Lām shamsiyyah" },
  { id: "lam_qamari", name: "Lām qamariyyah" },
  { id: "hams", name: "Hams" },
  { id: "qalqalah", name: "Qalqalah" },
  { id: "tanwin", name: "Tanwīn" },
] as const;

export type HuntRule = (typeof HUNT_RULES)[number]["id"];

const LOCATOR = /^H:(\d+):(\d+):(\d+):(\d+):([a-z_]+)$/;

export function parseHunt(label: string) {
  const m = LOCATOR.exec(label.trim());
  if (!m || !HUNT_RULES.some((r) => r.id === m[5])) return null;
  return {
    surah: Number(m[1]),
    ayah: Number(m[2]),
    word: Number(m[3]),
    letter: Number(m[4]),
    rule: m[5] as HuntRule,
  };
}

export function isRuleHunt(options: { label: string }[] | null | undefined): boolean {
  return !!options && options.length > 0 && options.every((o) => parseHunt(o.label) !== null);
}

export type HuntLetter = {
  /** "ayah:word:letter", the same for all of this letter's options. */
  key: string;
  value: string;
  /** This letter's option for each rule. */
  options: Partial<Record<HuntRule, HuntOption>>;
};

export type HuntWord = {
  surah: number;
  ayah: number;
  word: number;
  letters: HuntLetter[];
  /** The last word of its ayah in this passage: the ayah number follows it. */
  endsAyah: boolean;
};

/** The surah as words of letters, in the order the options are marked in. */
export function huntWords(options: HuntOption[]): HuntWord[] {
  const out: HuntWord[] = [];
  for (const option of [...options].sort((a, b) => a.position - b.position)) {
    const loc = parseHunt(option.label);
    if (!loc) continue;
    let word = out[out.length - 1];
    if (!word || word.ayah !== loc.ayah || word.word !== loc.word) {
      if (word) word.endsAyah = word.ayah !== loc.ayah;
      word = { surah: loc.surah, ayah: loc.ayah, word: loc.word, letters: [], endsAyah: false };
      out.push(word);
    }
    const key = `${loc.ayah}:${loc.word}:${loc.letter}`;
    let letter = word.letters.find((l) => l.key === key);
    if (!letter) {
      letter = { key, value: option.value ?? "", options: {} };
      word.letters.push(letter);
    }
    letter.options[loc.rule] = option;
  }
  if (out.length) out[out.length - 1].endsAyah = true;
  return out;
}

export type HuntTally = {
  found: number;
  total: number;
  wrong: number;
  /** One line per rule, in the order the rules are taught. */
  rules: { id: HuntRule; name: string; found: number; total: number; wrong: number }[];
  /** Positions of every option whose thing to find was not found. */
  missed: Set<number>;
};

/** What this answer found, got wrong and left, overall and rule by rule. */
export function huntTally(options: HuntOption[], selected: number[]): HuntTally {
  const chosen = new Set(selected);
  const ruleOf = (o: HuntOption) => parseHunt(o.label)?.rule;
  const found = new Set<string>();
  const every = new Set<string>();
  for (const o of options) {
    if (!o.inst) continue;
    every.add(o.inst);
    if (chosen.has(o.position)) found.add(o.inst);
  }
  const rules = HUNT_RULES.map((r) => {
    const mine = options.filter((o) => ruleOf(o) === r.id);
    const insts = new Set(mine.flatMap((o) => (o.inst ? [o.inst] : [])));
    return {
      id: r.id,
      name: r.name,
      found: [...insts].filter((i) => found.has(i)).length,
      total: insts.size,
      wrong: mine.filter((o) => chosen.has(o.position) && !o.correct).length,
    };
  });
  return {
    found: found.size,
    total: every.size,
    wrong: rules.reduce((n, r) => n + r.wrong, 0),
    rules,
    missed: new Set(options.filter((o) => o.inst && !found.has(o.inst)).map((o) => o.position)),
  };
}

/**
 * A share of the marks per thing found, each wrong tag cancelling one, floored
 * at zero. Null with no key recorded, like any question code cannot judge.
 */
export function huntScore(options: HuntOption[], selected: number[], points: number): number | null {
  const { found, total, wrong } = huntTally(options, selected);
  if (total === 0) return null;
  return Math.round(((points * Math.max(0, found - wrong)) / total) * 100) / 100;
}
