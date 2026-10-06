/**
 * "Which letter is being pronounced?" — the Qāʿidah listening question.
 *
 * A student hears one letter and taps it on a grid of the whole alphabet. In
 * the database it is nothing new: each letter is an ordinary `mcq` whose 29
 * options are the 28 letters and hamzah, with the recording on `media.clip`,
 * and it is marked like any other mcq. Two things are read off that shape
 * here, so no column or RPC change is needed for either:
 *
 *   · LETTER GRID. Options that are all single Arabic letters are drawn as a
 *     grid of tiles instead of 29 stacked rows, which on a phone would be four
 *     screens of scrolling per letter.
 *   · STEPS. Consecutive letter-grid questions with the same prompt are one
 *     question with parts (7a, 7b, …) shown a part at a time, with Back and
 *     Next, instead of ten copies of the same card one under another.
 *
 * Every screen that numbers questions reads `questionLabels`, so the student's
 * form, their results and the teacher's marking all call the same part "7c".
 *
 * Pure, no IO.
 */

type QuestionLike = {
  qtype: string;
  prompt: string;
  /** As stored, so a screen holding the raw jsonb can ask too. */
  options: unknown;
};

/** One letter, hamzah to yā', including the hamzah seats and tā' marbūṭah. */
const ARABIC_LETTER = /^[ء-ي]$/;

/** Fewer than this is an ordinary multiple choice that happens to be letters
 *  ("which of these is a throat letter?"), and reads better as a list. */
const MIN_GRID = 10;

/** The text an option shows: its value, else its label (as the form draws it). */
function optionText(o: unknown): string | null {
  if (typeof o !== "object" || o === null) return null;
  const { value, label } = o as { value?: unknown; label?: unknown };
  const text = typeof value === "string" ? value : typeof label === "string" ? label : null;
  return text === null ? null : text.trim();
}

export function isLetterGrid(options: unknown): boolean {
  if (!Array.isArray(options) || options.length < MIN_GRID) return false;
  return options.every((o) => {
    const text = optionText(o);
    return text !== null && ARABIC_LETTER.test(text);
  });
}

function isStep(q: QuestionLike): boolean {
  return q.qtype === "mcq" && isLetterGrid(q.options);
}

export type QuestionBlock<Q> =
  | { kind: "one"; q: Q; index: number; number: number }
  | { kind: "steps"; qs: Q[]; indexes: number[]; number: number };

/**
 * The paper as the student sees it: single questions, and runs of letter
 * questions folded into one stepped question. `index` is the position in the
 * array given; `number` is what the question is called.
 *
 * A run needs two or more parts and one prompt throughout. A lone letter
 * question, or a run whose prompts differ, is left as separate questions:
 * folding questions that ask different things would hide all but the first.
 */
export function blocksOf<Q extends QuestionLike>(questions: Q[]): QuestionBlock<Q>[] {
  const blocks: QuestionBlock<Q>[] = [];
  let number = 0;
  let i = 0;
  while (i < questions.length) {
    const q = questions[i];
    let end = i + 1;
    if (isStep(q)) {
      while (end < questions.length && isStep(questions[end]) && questions[end].prompt === q.prompt) end++;
    }
    number++;
    if (end - i >= 2) {
      const indexes = Array.from({ length: end - i }, (_, k) => i + k);
      blocks.push({ kind: "steps", qs: indexes.map((k) => questions[k]), indexes, number });
    } else {
      blocks.push({ kind: "one", q, index: i, number });
      end = i + 1;
    }
    i = end;
  }
  return blocks;
}

/** a, b, … z, then 27, 28 … should a run ever pass the alphabet. */
export function partLetter(k: number): string {
  return k < 26 ? String.fromCharCode(97 + k) : String(k + 1);
}

/** What each question is called, in array order: "1", "2", … "7a" … "7j", "8". */
export function questionLabels<Q extends QuestionLike>(questions: Q[]): string[] {
  const labels = new Array<string>(questions.length);
  for (const b of blocksOf(questions)) {
    if (b.kind === "one") labels[b.index] = String(b.number);
    else b.indexes.forEach((idx, k) => (labels[idx] = `${b.number}${partLetter(k)}`));
  }
  return labels;
}
