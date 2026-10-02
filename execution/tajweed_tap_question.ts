/**
 * tajweed_tap_question.ts — build a "tap the rule" question from real tajweed
 * annotations, and put it on a homework.
 *
 * Run:  cd web && npx tsx ../execution/tajweed_tap_question.ts            # dry run
 *       cd web && npx tsx ../execution/tajweed_tap_question.ts --commit   # write it
 *       cd web && npx tsx ../execution/tajweed_tap_question.ts --delete   # take it back off
 *
 * The answer key is DERIVED, never typed. Which words carry ikhfā' is a claim
 * about the Qur'an, so it comes from sourced data rather than from whoever
 * wrote the question: quran.com's tajweed markup of its own Uthmani text
 * (the same text `quran_words` holds), matched to our words LETTER BY LETTER
 * — see parseTajweed and LETTER_GUARD. iẓhār, heavy letters and the lām of
 * the Name of Allah, which the markup does not carry, are derived from the
 * letters themselves — see deriveRule.
 *
 * History: keys first came from cpfair/quran-tajweed's codepoint offsets into
 * Tanzil's 2017 text. Those drift by a letter after every tatweel, small mīm
 * and pause sign quran.com writes and Tanzil does not, and the old guard only
 * caught drift past the end of the ayah — so some keys were off by a word.
 * Every key built before the switch must be re-derived.
 *
 * A rule routinely SPANS TWO WORDS — ikhfā' is a tanwīn at the end of one
 * word meeting an ikhfā' letter at the start of the next (سَبْعًۭا شِدَادًۭا).
 * Both words are marked correct, because that is where the rule lives; the
 * prompt says so, so a student is not guessing at the convention.
 *
 * Spike shape: the question is a `checkbox` whose options are the words of the
 * passage, so it needs no schema change and rides the existing scoring path
 * (`per_option`: each correct word earns a share, wrong picks cancel, floored
 * at zero). If this graduates from a test, `qtype` should gain a real
 * `tap_words` value — deliberately not done yet, because Postgres cannot drop
 * an enum value once added and this question is meant to be deletable.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

/* ── what to build ───────────────────────────────────────────────────── */

/**
 * Every knob is a flag, so building the next one is a command rather than an
 * edit. The four that matter are the ones a teacher actually decides: which
 * rule to spot, which passage to spot it in, what the question says, and what
 * it is worth.
 */
const arg = (name: string, fallback?: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (value === undefined || value.startsWith("--")) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return value;
};

const COMMIT = process.argv.includes("--commit");
const DELETE = process.argv.includes("--delete");
const HELP = process.argv.includes("--help") || process.argv.includes("-h");

const HOMEWORK_NUMBER = Number(arg("homework", "107"));
const SURAH = Number(arg("surah", "78"));
const FROM_AYAH = Number(arg("from", "12"));
const TO_AYAH = Number(arg("to", "18"));
const RULE = arg("rule", "ikhfa");
const POINTS = Number(arg("points", "4"));
/** Last on the paper by default, so it never renumbers the real questions. */
const POSITION = Number(arg("position", "99"));

/** The 18 rules the annotation set knows, and what each one is called here. */
const RULES: Record<string, string> = {
  ikhfa: "ikhfā’",
  ikhfa_shafawi: "ikhfā’ shafawī",
  idghaam_ghunnah: "idghām with ghunna",
  idghaam_no_ghunnah: "idghām without ghunna",
  idghaam_shafawi: "idghām shafawī",
  idghaam_mutajaanisain: "idghām mutajānisayn",
  idghaam_mutaqaaribain: "idghām mutaqāribayn",
  iqlab: "iqlāb",
  ghunnah: "ghunna",
  qalqalah: "qalqala",
  madd_2: "madd of 2 ḥarakāt",
  madd_246: "madd of 2, 4 or 6 ḥarakāt",
  madd_muttasil: "madd muttaṣil",
  madd_munfasil: "madd munfaṣil",
  madd_6: "madd of 6 ḥarakāt",
  madd_arid: "madd ʿāriḍ li-s-sukūn (at the stop)",
  hamzat_wasl: "hamzat al-waṣl",
  lam_shamsiyyah: "lām shamsiyya",
  silent: "a silent letter",
  // Not in the annotation set — derived from the text itself, see DERIVED.
  idhaar_halqi: "iẓhār ḥalqī",
  idhaar_shafawi: "iẓhār shafawī",
  heavy_letters: "a heavy letter (خ ص ض غ ط ق ظ)",
  lam_allah_heavy: "a heavy lām in the Name of Allah",
  lam_allah_light: "a light lām in the Name of Allah",
};

/* ── rules the annotation set lacks ──────────────────────────────────── */

/**
 * cpfair marks every rule that CHANGES a sound, so iẓhār — the nūn or mīm
 * pronounced as written — has no annotation. It is still a fact about the
 * text, not a judgement, so it is derived here from the letters:
 *
 *   iẓhār ḥalqī    a nūn sākinah or tanwīn whose next pronounced letter is
 *                  one of the six throat letters (ء ه ع ح غ خ).
 *   iẓhār shafawī  a mīm sākinah whose next pronounced letter is anything
 *                  but م or ب.
 *
 * "Next pronounced letter" stays inside the ayah: the old papers treat each
 * ayah as stopped on, and a hamzat al-waṣl after the nūn or mīm means it is
 * read with a vowel instead, so it is not sākin at all.
 *
 * The quran.com Uthmani text writes the same distinction into its marks — a
 * nūn or mīm shows its sukūn only when it is pronounced clearly, and an iẓhār
 * tanwīn carries no small trailing mark (ۢ ۭ). That is used as an independent
 * cross-check: when the phonetic rule and the orthography disagree the run
 * prints a warning and the key must not be trusted until someone has looked.
 */
const SUKUN = new Set([0x652, 0x6e1]);
const TANWEEN = new Set([0x64b, 0x64c, 0x64d, 0x8f0, 0x8f1, 0x8f2]);
const TANWEEN_MARKED = new Set([0x6e2, 0x6ed]); // ikhfā'/iqlāb/idghām tanwīn
const THROAT = new Set([0x621, 0x622, 0x623, 0x624, 0x625, 0x626, 0x647, 0x639, 0x62d, 0x63a, 0x62e]);
const isMark = (c: number) =>
  (c >= 0x64b && c <= 0x65f) || c === 0x670 || (c >= 0x6d6 && c <= 0x6ed) || (c >= 0x8d3 && c <= 0x8ff);
const HAMZA_ABOVE = new Set([0x654, 0x655]);

/**
 * A word as letters: each base letter with the marks on it, its printed text,
 * and its codepoint span inside the word (so annotation offsets and "tap the
 * letters" keys can both be resolved to a letter).
 */
export type Letter = { ch: number; marks: number[]; text: string; start: number; end: number };
export function letters(text: string): Letter[] {
  const out: Letter[] = [];
  const cps = [...text];
  cps.forEach((s, k) => {
    const c = s.codePointAt(0)!;
    const last = out[out.length - 1];
    if (isMark(c)) {
      // A hamza written above a tatweel (ـٔ) is a hamza, i.e. a letter.
      if (HAMZA_ABOVE.has(c) && last && last.ch === 0x640) last.ch = 0x621;
      else if (last) last.marks.push(c);
      if (last) { last.text += s; last.end = k + 1; }
      return;
    }
    // A bare tatweel is only a stretch: it rides on the letter before it.
    if (c === 0x640 && last && !(HAMZA_ABOVE.has(cps[k + 1]?.codePointAt(0) ?? 0))) {
      last.text += s; last.end = k + 1;
      return;
    }
    out.push({ ch: c, marks: [], text: s, start: k, end: k + 1 });
  });
  return out;
}

const HEAVY = new Set([0x62e, 0x635, 0x636, 0x63a, 0x637, 0x642, 0x638]); // خص ضغط قظ
const VOWEL: Record<number, "a" | "u" | "i"> = { 0x64e: "a", 0x64f: "u", 0x650: "i", 0x64b: "i", 0x64c: "i", 0x64d: "i" };
const SILENT = 0x6df; // small high rounded zero: written, never read

/**
 * The lām of the Name of Allah: heavy after a fatḥah or ḍammah, light after a
 * kasrah. Returns the index of the doubled lām in a word that IS the Name
 * (ٱللَّهُ / لِلَّهِ / بِٱللَّهِ / ٱللَّهُمَّ …), or -1. ٱللَّهْوِ (amusement) is
 * excluded by its sākin hā'.
 */
function allahLam(ls: Letter[]): number {
  for (let j = 1; j + 1 < ls.length; j++) {
    const lam = ls[j], ha = ls[j + 1], before = ls[j - 1];
    if (lam.ch === 0x644 && lam.marks.includes(0x651) && before.ch === 0x644 && ha.ch === 0x647 && !ha.marks.some((m) => SUKUN.has(m)))
      return j;
  }
  return -1;
}
/** The vowel the reader is carrying into letter j of word i (null: starting). */
function vowelBefore(lw: Letter[][], i: number, j: number): "a" | "u" | "i" | null {
  for (let wi = i, lj = j - 1; wi >= 0; wi--, lj = wi >= 0 ? lw[wi].length - 1 : 0) {
    for (; lj >= 0; lj--) {
      const l = lw[wi][lj];
      if (l.ch === 0x671 || l.marks.includes(SILENT)) continue; // hamzat al-waṣl / silent letter
      const v = l.marks.map((m) => VOWEL[m]).find(Boolean);
      if (v) return v;
      if (l.marks.some((m) => SUKUN.has(m))) return "i"; // a sākin meeting hamzat al-waṣl takes a kasrah
      // a bare long-vowel letter is dropped in connection: keep looking back
      if ([0x627, 0x648, 0x649, 0x64a].includes(l.ch) && l.marks.length === 0) continue;
      return null;
    }
  }
  return null; // starting the ayah on hamzat al-waṣl: fatḥah, heavy
}

export function deriveRule(
  rule: string,
  ws: { text: string }[],
): { marked: Set<number>; letterKeys: Set<string>; instances: number; warnings: string[] } {
  const marked = new Set<number>();
  const letterKeys = new Set<string>(); // "word:letter"
  const warnings: string[] = [];
  let instances = 0;
  const lw = ws.map((w) => letters(w.text).filter((l) => l.ch !== 0x640));

  if (rule === "heavy_letters") {
    lw.forEach((ls, i) => ls.forEach((l, j) => {
      if (!HEAVY.has(l.ch)) return;
      instances++; marked.add(i); letterKeys.add(`${i}:${j}`);
    }));
    return { marked, letterKeys, instances, warnings };
  }
  if (rule === "lam_allah_heavy" || rule === "lam_allah_light") {
    lw.forEach((ls, i) => {
      const j = allahLam(ls);
      if (j < 0) return;
      // لِلَّهِ carries its vowel on the first lām; in ٱللَّهِ that lām is
      // silent, so the vowel comes from whatever precedes it.
      const v = ls[j - 1].marks.map((m) => VOWEL[m]).find(Boolean) ?? vowelBefore(lw, i, j - 1);
      const heavy = v === null || v === "a" || v === "u";
      if (heavy !== (rule === "lam_allah_heavy")) return;
      instances++; marked.add(i); letterKeys.add(`${i}:${j}`);
    });
    return { marked, letterKeys, instances, warnings };
  }
  /** The first letter that follows letter j of word i, within the ayah. */
  const next = (i: number, j: number): { ch: number; word: number; letter: number } | null => {
    if (j + 1 < lw[i].length) return { ch: lw[i][j + 1].ch, word: i, letter: j + 1 };
    if (i + 1 < lw.length && lw[i + 1].length) return { ch: lw[i + 1][0].ch, word: i + 1, letter: 0 };
    return null;
  };
  for (let i = 0; i < lw.length; i++) {
    for (let j = 0; j < lw[i].length; j++) {
      const { ch, marks } = lw[i][j];
      const hasVowel = marks.some((m) => (m >= 0x64e && m <= 0x650) || m === 0x651);
      const hasTanween = marks.some((m) => TANWEEN.has(m));
      const sukun = marks.some((m) => SUKUN.has(m));
      // A tanwīn sounds at the end of its word whatever is written after it
      // (the alif of نَارًۭا, the yā' of هُدًۭى), so its next sound is the next word.
      const n = hasTanween ? (i + 1 < lw.length && lw[i + 1].length ? { ch: lw[i + 1][0].ch, word: i + 1, letter: 0 } : null) : next(i, j);
      if (!n) continue;
      // The other direction of the cross-check: a nūn or mīm WRITTEN as iẓhār
      // (sukūn shown, or a plain tanwīn mid-ayah) that the phonetic rule does
      // not claim means one of the two has misread the text.
      const writtenNun = (ch === 0x646 && sukun) || (hasTanween && !marks.some((m) => TANWEEN_MARKED.has(m)));
      if (rule === "idhaar_halqi" && writtenNun && !THROAT.has(n.ch) && n.ch !== 0x671)
        warnings.push(`word ${i + 1} (${ws[i].text}): written as iẓhār but the next letter is not a throat letter`);
      if (rule === "idhaar_shafawi" && ch === 0x645 && sukun && (n.ch === 0x645 || n.ch === 0x628))
        warnings.push(`word ${i + 1} (${ws[i].text}): written with sukūn but followed by ${n.ch === 0x645 ? "م" : "ب"}`);
      if (rule === "idhaar_halqi") {
        const nunSakin = ch === 0x646 && !hasVowel && !hasTanween;
        if (!(nunSakin || hasTanween)) continue;
        if (!THROAT.has(n.ch)) continue;
        instances++;
        marked.add(i);
        marked.add(n.word);
        letterKeys.add(`${i}:${j}`); letterKeys.add(`${n.word}:${n.letter}`);
        const written = nunSakin ? sukun : !marks.some((m) => TANWEEN_MARKED.has(m));
        if (!written) warnings.push(`word ${i + 1} (${ws[i].text}): reads as iẓhār but is not written as one`);
      } else if (rule === "idhaar_shafawi") {
        const mimSakin = ch === 0x645 && !hasVowel && !hasTanween;
        if (!mimSakin || n.ch === 0x645 || n.ch === 0x628 || n.ch === 0x671) continue;
        instances++;
        marked.add(i);
        marked.add(n.word);
        letterKeys.add(`${i}:${j}`); letterKeys.add(`${n.word}:${n.letter}`);
        if (!sukun) warnings.push(`word ${i + 1} (${ws[i].text}): reads as iẓhār shafawī but has no sukūn`);
      }
    }
  }
  return { marked, letterKeys, instances, warnings };
}

/* ── quran.com's own tajweed markup ──────────────────────────────────── */

/**
 * WHY THIS REPLACED THE cpfair OFFSETS. cpfair's annotations are codepoint
 * offsets into Tanzil's 2017 text. Our words are quran.com's text, which adds
 * a tatweel before every dagger alif, a small mīm after ikhfā'/idghām tanwīn
 * and a space before each pause mark — so the offsets drifted by one or more
 * letters after any of those, silently, inside the guard's tolerance (found
 * when qalqala keyed the ل of عَلَقٍ in 96:2).
 *
 * quran.com publishes the SAME text with the rules as inline tags
 * (`<tajweed class=qalaqah>ق</tajweed>`), so each rule sits on a letter of our
 * own text and nothing is aligned by offset. The two are matched letter by
 * letter (base letters only — marks, tatweel, spaces and pause signs are
 * attached to the letter they sit on); if the letter sequences differ by even
 * one letter the run aborts.
 */
const CLASS_TO_RULE: Record<string, string[]> = {
  ham_wasl: ["hamzat_wasl"], laam_shamsiyah: ["lam_shamsiyyah"], qalaqah: ["qalqalah"], ghunnah: ["ghunnah"],
  ikhafa: ["ikhfa"], ikhafa_shafawi: ["ikhfa_shafawi"], iqlab: ["iqlab"],
  idgham_ghunnah: ["idghaam_ghunnah"], idgham_wo_ghunnah: ["idghaam_no_ghunnah"], idgham_shafawi: ["idghaam_shafawi"],
  idgham_mutajanisayn: ["idghaam_mutajaanisain"], idgham_mutaqaribayn: ["idghaam_mutaqaaribain"],
  // madda_obligatory covers muttaṣil AND munfaṣil (both 4–5 in this ṭarīq) —
  // split by position in parseTajweed. madda_permissible is the ʿāriḍ / līn at a stop.
  madda_normal: ["madd_2"], madda_permissible: ["madd_246", "madd_arid"], madda_obligatory: [],
  madda_necessary: ["madd_6"], slnt: ["silent"],
};
const isBase = (c: number) => (c >= 0x621 && c <= 0x63a) || (c >= 0x641 && c <= 0x64a) || c === 0x671 || c === 0x6cc || c === 0x6c1 || c === 0x66e;
/**
 * The two texts spell a few things differently without being different
 * letters: the hamza's seat (ا/أ/إ/آ/ء, ى/ي/ئ/ٮ, و/ؤ), and a long ā that ours
 * writes on a yā' (ءَاتَىٰهُمْ) where the markup writes a tatweel (ءَاتَـٰهُمْ).
 * Letters are compared by these classes; a letter one side lacks is allowed
 * only if it is one of them. Anything else aborts the run.
 */
const CLASS = (c: number): number => {
  if ([0x627, 0x623, 0x625, 0x622, 0x621].includes(c)) return 0x627;
  if ([0x649, 0x64a, 0x626, 0x66e].includes(c)) return 0x649;
  if ([0x648, 0x624].includes(c)) return 0x648;
  return c;
};
const VARIANT = new Set([0x627, 0x623, 0x625, 0x622, 0x621, 0x649, 0x64a, 0x626, 0x66e, 0x648, 0x624]);
/** Our letter index → markup letter index (or -1), by LCS over letter classes; null if a non-variant letter is unmatched. */
function alignLetters(a: number[], b: number[]): number[] | null {
  const n = a.length, m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = CLASS(a[i]) === CLASS(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Array<number>(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (CLASS(a[i]) === CLASS(b[j])) { map[i] = j; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { if (!VARIANT.has(a[i])) return null; i++; }
    else { if (!VARIANT.has(b[j])) return null; j++; }
  }
  for (; i < n; i++) if (!VARIANT.has(a[i])) return null;
  for (; j < m; j++) if (!VARIANT.has(b[j])) return null;
  return map;
}
const HAMZAS = new Set([0x621, 0x623, 0x624, 0x625, 0x626, 0x622]);

async function tajweedSurah(surah: number): Promise<Map<number, string>> {
  const cache = join(tmpdir(), "bsms-tajweed", `qurancom-tajweed-${surah}.json`);
  if (!existsSync(cache)) {
    mkdirSync(dirname(cache), { recursive: true });
    const res = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=${surah}`);
    if (!res.ok) throw new Error(`quran.com tajweed text for surah ${surah}: HTTP ${res.status}`);
    writeFileSync(cache, await res.text());
  }
  const d = JSON.parse(readFileSync(cache, "utf8")) as { verses: { verse_key: string; text_uthmani_tajweed: string }[] };
  return new Map(d.verses.map((v) => [Number(v.verse_key.split(":")[1]), v.text_uthmani_tajweed]));
}

/**
 * One ayah of markup → its base letters, each with the rules on it, plus each
 * rule instance (a tag) as the list of base-letter indexes it covers. The
 * muttaṣil / munfaṣil split is derived: quran.com files both as
 * "obligatory" madd. When the madd letter ends its word (the hamza opens the
 * next word) it is munfaṣil, as are the yā' an-nidā' / hā' at-tanbīh madds at
 * the very start of a word (يَـٰٓأَيُّهَا, هَـٰٓؤُلَآءِ) which the course teaches as
 * munfaṣil; otherwise (hamza later in the same word) it is muttaṣil.
 */
function parseTajweed(markup: string): { bases: { ch: number; rules: Set<string> }[]; instances: { rule: string; letters: number[] }[] } {
  const plain: string[] = [];
  const charRules: Set<string>[] = [];
  const charTag: number[] = [];
  const tags: string[] = [];
  let active: string | null = null;
  let tagNo = -1;
  for (const tok of markup.replace(/<span class=end>.*?<\/span>/g, "").split(/(<tajweed class=[a-z_]+>|<\/tajweed>)/)) {
    const open = tok.match(/^<tajweed class=([a-z_]+)>$/);
    if (open) { active = open[1]; tagNo = tags.push(active) - 1; continue; }
    if (tok === "</tajweed>") { active = null; continue; }
    for (const ch of [...tok]) {
      plain.push(ch);
      charRules.push(new Set(active ? CLASS_TO_RULE[active] ?? [active] : []));
      charTag.push(active ? tagNo : -1);
    }
  }
  const text = plain.join("").trimEnd();
  const units = letters(text);
  const bases: { ch: number; rules: Set<string>; tags: Set<number>; word: number }[] = [];
  let word = 0;
  for (const u of units) {
    if (u.ch === 0x20) { word++; continue; }
    const rules = new Set<string>(); const tg = new Set<number>();
    for (let k = u.start; k < u.end; k++) { charRules[k]?.forEach((r) => rules.add(r)); if (charTag[k] >= 0) tg.add(charTag[k]); }
    if (isBase(u.ch)) bases.push({ ch: u.ch, rules, tags: tg, word });
    else if (bases.length) { rules.forEach((r) => bases[bases.length - 1].rules.add(r)); tg.forEach((t) => bases[bases.length - 1].tags.add(t)); }
  }
  const instances: { rule: string; letters: number[] }[] = [];
  tags.forEach((cls, t) => {
    const ls = bases.map((b, i) => (b.tags.has(t) ? i : -1)).filter((i) => i >= 0);
    if (!ls.length) return;
    for (const r of CLASS_TO_RULE[cls] ?? [cls]) instances.push({ rule: r, letters: ls });
    if (cls === "madda_obligatory") {
      const last = ls[ls.length - 1];
      // A silent letter (the alif of ءَامَنُوٓا۟) is written, never read: skip it
      // when asking what comes after the madd.
      let nx = last + 1;
      while (nx < bases.length && bases[nx].rules.has("silent")) nx++;
      const endsWord = nx >= bases.length || bases[nx].word !== bases[last].word;
      const firstOfWord = ls[0] === 0 || bases[ls[0] - 1].word !== bases[ls[0]].word;
      const prefix = firstOfWord && [0x647, 0x64a].includes(bases[ls[0]].ch); // هَـٰٓ / يَـٰٓ
      const nextIsHamza = nx < bases.length && HAMZAS.has(bases[nx].ch);
      const kind = (endsWord && nextIsHamza) || prefix ? "madd_munfasil" : "madd_muttasil";
      // Munfaṣil spans two words — the madd and the hamza that causes it — so,
      // like every other cross-word rule here, both words are in the key.
      instances.push({ rule: kind, letters: kind === "madd_munfasil" && endsWord && nextIsHamza ? [...ls, nx] : ls });
      ls.forEach((i) => bases[i].rules.add(kind));
    }
  });
  return { bases: bases.map(({ ch, rules }) => ({ ch, rules })), instances };
}

const DERIVED = new Set(["idhaar_halqi", "idhaar_shafawi", "heavy_letters", "lam_allah_heavy", "lam_allah_light"]);

/**
 * Said in the question when nothing better is given. It has to state the
 * both-words convention: a rule routinely sits across a word boundary, and a
 * student who does not know that is being marked on a convention rather than
 * on tajweed.
 */
const defaultPrompt = () =>
  `Tap every word where ${RULES[RULE] ?? RULE} happens in this passage ` +
  `(${SURAH}:${FROM_AYAH}–${TO_AYAH}). When the rule sits across two words, ` +
  `tap BOTH of them.`;

const PROMPT = arg("prompt", defaultPrompt());

if (HELP) {
  console.log(`
Build a "tap the rule" question from sourced tajweed annotations.

  --homework N   homework NUMBER to attach to        (default 107)
  --surah N      surah                               (default 78)
  --from N       first ayah                          (default 12)
  --to N         last ayah                           (default 18)
  --rule NAME    one of: ${Object.keys(RULES).join(", ")}
  --points N     marks for the question              (default 4)
  --position N   position on the paper               (default 99)
  --prompt "…"   the question text                   (default: generated)
  --commit       write it (otherwise a dry run)
  --delete       remove the question at --position from --homework

Dry run prints the passage with the key marked, so the wording and the key can
be checked before anything is written.
`);
  process.exit(0);
}

/* ── setup ───────────────────────────────────────────────────────────── */

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Word = {
  ayah_number: number;
  word_position: number;
  text_uthmani: string;
  is_end: boolean;
  /** The printed word as a single KFGQPC glyph, page-font specific. */
  code_v1: string | null;
  page_number: number;
};


/* ── the mapping ─────────────────────────────────────────────────────── */

export type Tapword = {
  ayah: number;
  position: number;
  text: string;
  glyph: string | null;
  page: number;
  correct: boolean;
  /** The word's letters with their own key, for "tap the letters". */
  letters: { t: string; key: boolean }[];
};

/**
 * Words of the passage in reading order, each flagged with whether the rule
 * touches it, with a per-letter key for "tap the letters". Keys come from the
 * derived rules or from quran.com's tajweed markup (see parseTajweed); throws
 * when the markup's letters do not match our words' letters.
 */
export function mapRule(
  words: Word[],
  markup: Map<number, string>,
  rule: string,
): { passage: Tapword[]; instances: number } {
  const byAyah = new Map<number, Word[]>();
  for (const w of words) {
    if (w.is_end) continue; // the ayah-number glyph is not a word to tap
    const list = byAyah.get(w.ayah_number) ?? [];
    list.push(w);
    byAyah.set(w.ayah_number, list);
  }

  const passage: Tapword[] = [];
  let instances = 0;

  for (const ayah of [...byAyah.keys()].sort((a, b) => a - b)) {
    const ws = [...byAyah.get(ayah)!].sort((a, b) => a.word_position - b.word_position);
    const wordLetters = ws.map((w) => letters(w.text_uthmani).filter((l) => l.ch !== 0x640));
    const marked = new Set<number>();
    const letterKeys = new Set<string>();

    if (DERIVED.has(rule)) {
      const d = deriveRule(rule, ws.map((w) => ({ text: w.text_uthmani })));
      instances += d.instances;
      for (const i of d.marked) marked.add(ws[i].word_position);
      for (const k of d.letterKeys) letterKeys.add(k);
      for (const w of d.warnings) console.warn(`warning ${SURAH}:${ayah} — ${w}`);
    } else {
      const m = markup.get(ayah);
      if (!m) throw new Error(`${SURAH}:${ayah} — no tajweed markup`);
      const { bases, instances: inst } = parseTajweed(m);
      // Our base letters, in order, as (word, letter) — the same walk parseTajweed does.
      const ours: { w: number; l: number; ch: number }[] = [];
      wordLetters.forEach((ls, i) => ls.forEach((l, j) => { if (isBase(l.ch)) ours.push({ w: i, l: j, ch: l.ch }); }));
      // LETTER_GUARD — the whole method rests on the two texts having the same letters.
      const map = alignLetters(ours.map((o) => o.ch), bases.map((b) => b.ch));
      if (!map) throw new Error(`${SURAH}:${ayah} — our letters and the tajweed markup's differ beyond spelling variants; do not trust the key.`);
      const back = new Map<number, number>(); // markup letter → our letter
      map.forEach((j, k) => { if (j >= 0) back.set(j, k); });
      const hits = inst.filter((x) => x.rule === rule);
      instances += hits.length;
      for (const h of hits) {
        let placed = false;
        for (const j of h.letters) {
          const k = back.get(j);
          if (k === undefined) continue;
          placed = true;
          marked.add(ws[ours[k].w].word_position);
          letterKeys.add(`${ours[k].w}:${ours[k].l}`);
        }
        if (!placed) throw new Error(`${SURAH}:${ayah} — a ${rule} instance has no letter in our text; do not trust the key.`);
      }
    }

    ws.forEach((w, i) => {
      passage.push({
        ayah,
        position: w.word_position,
        text: w.text_uthmani,
        glyph: w.code_v1,
        page: w.page_number,
        correct: marked.has(w.word_position),
        letters: wordLetters[i].map((l, j) => ({ t: l.text, key: letterKeys.has(`${i}:${j}`) })),
      });
    });
  }

  return { passage, instances };
}

/* ── run ─────────────────────────────────────────────────────────────── */

async function main() {

  const { data: hw } = await db
    .from("homeworks")
    .select("id, number, title, total_marks, is_graded")
    .eq("number", HOMEWORK_NUMBER)
    .maybeSingle();
  if (!hw) throw new Error(`no homework numbered ${HOMEWORK_NUMBER}`);

  if (DELETE) {
    const { data: gone, error } = await db
      .from("questions")
      .delete()
      .eq("homework_id", hw.id)
      .eq("position", POSITION)
      .select("id");
    if (error) throw error;
    console.log(`deleted ${gone?.length ?? 0} question(s) from ${hw.title}`);
    process.exit(0);
  }

  const { data: words, error: wordErr } = await db
    .from("quran_words")
    .select("ayah_number, word_position, text_uthmani, is_end, code_v1, page_number")
    .eq("surah_number", SURAH)
    .gte("ayah_number", FROM_AYAH)
    .lte("ayah_number", TO_AYAH)
    .order("ayah_number")
    .order("word_position");
  if (wordErr) throw wordErr;
  if (!words?.length) throw new Error(`no words seeded for ${SURAH}:${FROM_AYAH}-${TO_AYAH}`);

  const { passage, instances } = mapRule(words as Word[], DERIVED.has(RULE) ? new Map() : await tajweedSurah(SURAH), RULE);

  // The label carries the page as well as the locator, because the page names
  // the glyph font; the value carries the glyph AND the readable text, because
  // the student RPC passes only these three fields through.
  const options = passage.map((w, i) => ({
    position: i + 1,
    label: `${SURAH}:${w.ayah}:${w.position}:${w.page}`,
    value: w.glyph ? `${w.glyph}\t${w.text}` : w.text,
    correct: w.correct,
  }));

  const unprinted = passage.filter((w) => !w.glyph);
  if (unprinted.length) {
    console.warn(
      `warning: ${unprinted.length} of ${passage.length} words have no printed glyph ` +
        `and will fall back to Amiri, which renders the Madani marks poorly.`,
    );
  }
  const key = options.filter((o) => o.correct);

  console.log(`\n${hw.title} — ${SURAH}:${FROM_AYAH}-${TO_AYAH}, rule "${RULE}"`);
  console.log(`${options.length} words · ${instances} instances · ${key.length} words in the key\n`);
  let ayah = 0;
  for (const w of passage) {
    if (w.ayah !== ayah) {
      ayah = w.ayah;
      process.stdout.write(`\n  ${SURAH}:${ayah}  `);
    }
    process.stdout.write(w.correct ? `[${w.text}]✓ ` : `${w.text} `);
  }
  console.log("\n");

  // --json PATH: the passage as data, for the homework drafts and the review
  // page. --audio adds Al-Ḥuṣarī's murattal from QUL (Tarteel's Quranic
  // Universal Library, resource 316 = internal recitation 6, surah by surah):
  // the surah's file plus each word's [position, start ms, end ms] in it,
  // which is what a "name the rule you heard" clip plays a slice of. QUL's
  // ayah-by-ayah Ḥuṣarī sets (20–22) have broken timings (70–100 ms words),
  // so the surah set is the one to cut from.
  const jsonPath = process.argv.includes("--json") ? arg("json") : null;
  if (jsonPath) {
    const ayahs: Record<string, unknown>[] = [];
    let qul: { url: string; ayahs: Record<string, { time_from: number; time_to: number; segments: number[][] }> } | null = null;
    if (process.argv.includes("--audio")) {
      const cache = join(tmpdir(), "bsms-tajweed", `qul-husary-6-${SURAH}.json`);
      if (!existsSync(cache)) {
        const res = await fetch(`https://qul.tarteel.ai/api/v1/audio/surah_segments/6?surah=${SURAH}&per_page=300`);
        if (!res.ok) throw new Error(`QUL segments for surah ${SURAH}: HTTP ${res.status}`);
        mkdirSync(dirname(cache), { recursive: true });
        writeFileSync(cache, await res.text());
      }
      const d = JSON.parse(readFileSync(cache, "utf8")) as { audio: { url: string }; segments: Record<string, { time_from: number; time_to: number; segments: number[][] }> };
      qul = { url: d.audio.url, ayahs: d.segments };
    }
    for (const n of [...new Set(passage.map((w) => w.ayah))]) {
      const seg = qul?.ayahs[`${SURAH}:${n}`];
      const audio = qul && seg ? {
        reciter: "Mahmoud Khalil Al-Husary (murattal), QUL resource 316",
        url: qul.url,
        from_ms: seg.time_from,
        to_ms: seg.time_to,
        // [word position, start ms, end ms], absolute in the surah's file
        segments: seg.segments,
      } : null;
    ayahs.push({
        ref: `${SURAH}:${n}`, audio,
        words: passage.filter((w) => w.ayah === n).map((w) => ({ t: w.text, position: w.position, key: w.correct, letters: w.letters })),
      });
    }
    writeFileSync(jsonPath, JSON.stringify({
      rule: RULE, surah: SURAH, from: FROM_AYAH, to: TO_AYAH, instances, words: options.length,
      key_words: key.length, key_letters: passage.reduce((n, w) => n + w.letters.filter((l) => l.key).length, 0), ayahs,
    }, null, 1));
    console.log(`wrote ${jsonPath}`);
  }

  if (!COMMIT) {
    console.log("dry run — nothing written. Pass --commit to add it, --delete to remove it.");
    process.exit(0);
  }

  const { data: existing } = await db
    .from("questions")
    .select("id")
    .eq("homework_id", hw.id)
    .eq("position", POSITION)
    .maybeSingle();

  const row = {
    homework_id: hw.id,
    position: POSITION,
    qtype: "checkbox" as const,
    scoring: "per_option" as const,
    prompt: PROMPT,
    points: POINTS,
    is_bonus: false,
    is_task: false,
    needs_key: false,
    options,
    rubric: null,
  };

  if (existing) {
    const { error } = await db.from("questions").update(row).eq("id", existing.id);
    if (error) throw error;
    console.log(`updated question ${existing.id}`);
  } else {
    const { data: made, error } = await db.from("questions").insert(row).select("id").single();
    if (error) throw error;
    console.log(`created question ${made.id}`);
  }
  console.log(`on ${hw.title} (homework ${hw.number}) — ungraded, ${POINTS} marks, position ${POSITION}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
