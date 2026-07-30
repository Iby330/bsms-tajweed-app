/**
 * Objective scoring + jsonb parsers — pure, deterministic, no IO.
 *
 * Scoring runs in code (never the LLM) for every question with an answer key.
 * `null` means "no automatic mark" → the teacher's manual queue.
 *
 * The parsers exist because Postgres `jsonb` arrives as `unknown`: every
 * options / rubric / response value is validated at the boundary so the rest
 * of the pipeline can trust its types.
 */

/* ── types ───────────────────────────────────────────────────────────── */

export type Scoring = "exact" | "per_option" | "manual";
export type QType = "mcq" | "checkbox" | "text" | "paragraph" | "grid";

export type AnswerResponse = {
  selected?: number[];
  text?: string;
  grid?: Record<string, string>;
};

export type QuestionOption = {
  position: number;
  label: string;
  value: string;
  correct: boolean;
};

export type RubricConcept = { id: string; desc: string; marks: number };
export type AutoRubricResult = { id: string; present: boolean; why?: string };

export type MarkableQuestion = {
  qtype: QType;
  scoring: Scoring;
  points: number;
  is_bonus?: boolean;
  is_task?: boolean;
  options: QuestionOption[] | null;
  rubric?: RubricConcept[] | null;
};

/* ── jsonb parsers ───────────────────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Never throws: a malformed response is simply an empty answer. */
export function parseResponse(raw: unknown): AnswerResponse {
  if (!isRecord(raw)) return {};
  const out: AnswerResponse = {};
  if (Array.isArray(raw.selected)) {
    out.selected = raw.selected.filter(
      (n): n is number => typeof n === "number" && Number.isInteger(n),
    );
  }
  if (typeof raw.text === "string") out.text = raw.text;
  if (isRecord(raw.grid)) {
    const grid: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.grid)) {
      if (typeof v === "string") grid[k] = v;
    }
    out.grid = grid;
  }
  return out;
}

/** Strict: one bad entry invalidates the whole key (better than half a key). */
export function parseOptions(raw: unknown): QuestionOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: QuestionOption[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const { position, label, value, correct } = item;
    if (typeof position !== "number") return null;
    out.push({
      position,
      label: typeof label === "string" ? label : "",
      value: typeof value === "string" ? value : "",
      correct: correct === true,
    });
  }
  return out;
}

export function parseRubric(raw: unknown): RubricConcept[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RubricConcept[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const { id, desc, marks } = item;
    if (typeof id !== "string" || typeof marks !== "number") return null;
    out.push({ id, desc: typeof desc === "string" ? desc : "", marks });
  }
  return out;
}

export function parseAutoRubric(raw: unknown): AutoRubricResult[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: AutoRubricResult[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    const { id, present, why } = item;
    if (typeof id !== "string" || typeof present !== "boolean") return null;
    out.push({ id, present, ...(typeof why === "string" ? { why } : {}) });
  }
  return out;
}

/* ── scoring ─────────────────────────────────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @returns marks awarded, or null when the question cannot be auto-marked
 *          (grid, manual scoring, free-text, or a missing answer key).
 *
 * Practical tasks ("send a voice note") score 0 rather than null: they carry
 * no marks, so sending 22 of them to the manual queue would be noise. The
 * teacher still hears the recording on the review screen.
 */
export function scoreObjective(
  question: MarkableQuestion,
  response: unknown,
): number | null {
  if (question.is_task) return 0;

  if (question.scoring === "manual") return null;
  if (question.qtype === "text" || question.qtype === "paragraph") return null;
  if (question.qtype === "grid") return null;

  const correct = (question.options ?? [])
    .filter((o) => o.correct)
    .map((o) => o.position);
  if (correct.length === 0) return null; // no key recorded → don't guess

  const parsed = parseResponse(response);
  const selected = [...new Set(parsed.selected ?? [])];
  const correctSet = new Set(correct);
  const hits = selected.filter((p) => correctSet.has(p)).length;
  const misses = selected.filter((p) => !correctSet.has(p)).length;

  if (question.scoring === "per_option") {
    // wrong picks cancel right ones, floored at zero — mirrors how Google
    // Forms behaved on the multi-mark checkbox questions ("1 mark each")
    const net = Math.max(0, hits - misses);
    return round2((question.points * net) / correct.length);
  }

  const exact = hits === correct.length && misses === 0;
  return exact ? question.points : 0;
}

/** True when this question needs the LLM or a human rather than code. */
export function needsHumanOrLlm(question: MarkableQuestion): boolean {
  return scoreObjective(question, { selected: [] }) === null;
}
