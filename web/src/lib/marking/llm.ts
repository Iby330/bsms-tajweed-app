import "server-only";
import type { RubricConcept, AutoRubricResult } from "./objective";

/**
 * Free-text marking via Groq.
 *
 * Configuration below is NOT arbitrary — it is the exact setup verified
 * against real BSMS student answers (9/9, ~0.4s/question): the six ways
 * students wrote "Mad Tabi'i" (Arabic script, four transliterations, English)
 * all marked correct, and a wrong answer, an off-topic answer and a blank all
 * correctly refused.
 *
 * Two rules that matter:
 *  · ONE question per call — small focused prompts beat one fat prompt, and
 *    they keep every request far under the free tier's tokens-per-minute cap.
 *  · The model returns booleans per rubric concept; MARKS ARE SUMMED IN CODE.
 *    The model never does arithmetic and never sees a total.
 *
 * Student names and emails are NEVER sent — only question, rubric, answer.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const MARKING_MODEL = "llama-3.3-70b-versatile";
/** Same API shape; swap here if the eval ever favours it. */
export const FALLBACK_MODEL = "openai/gpt-oss-120b";

export const MARKING_SYSTEM_PROMPT =
  "You mark Tajweed homework for a UK university programme. Students answer in Arabic script, " +
  "Latin transliteration, English, or a mix — all equally valid. Judge MEANING only, never spelling or script. " +
  "Transliteration is wildly inconsistent (tabai / tabee'i / tabiyi / طبيعي all denote the same term). " +
  "A blank or off-topic answer earns nothing. Award each rubric concept independently. " +
  'Return ONLY JSON: {"concepts":[{"id":"<id>","present":true|false,"why":"<8 words max>"}]}';

export type FreeTextMarkResult = {
  marks: number;
  concepts: AutoRubricResult[];
  model: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Marks summed in code from the model's per-concept booleans. */
export function marksFromConcepts(
  rubric: RubricConcept[],
  concepts: AutoRubricResult[],
): number {
  const present = new Set(concepts.filter((c) => c.present).map((c) => c.id));
  const total = rubric.reduce(
    (sum, c) => sum + (present.has(c.id) ? c.marks : 0),
    0,
  );
  return Math.round(total * 100) / 100;
}

/** Pull the concepts array out of the model's reply. Null when unusable. */
export function parseModelReply(
  content: string,
  rubric: RubricConcept[],
): AutoRubricResult[] | null {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    // json_object mode occasionally wraps output — salvage the object
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      json = JSON.parse(content.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (typeof json !== "object" || json === null) return null;
  const raw = (json as { concepts?: unknown }).concepts;
  if (!Array.isArray(raw)) return null;

  const byId = new Map<string, AutoRubricResult>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { id, present, why } = item as Record<string, unknown>;
    if (typeof id !== "string") continue;
    byId.set(id, {
      id,
      present: present === true,
      ...(typeof why === "string" ? { why: why.slice(0, 120) } : {}),
    });
  }
  if (byId.size === 0) return null;

  // Always return one entry per rubric concept: a concept the model omitted
  // is treated as absent rather than silently skipped.
  return rubric.map(
    (c) => byId.get(c.id) ?? { id: c.id, present: false, why: "not addressed" },
  );
}

/**
 * Mark one free-text answer. Returns null when the model can't be trusted
 * (rate-limited past retries, or unparseable twice) → teacher's manual queue.
 */
export async function markFreeText(
  params: {
    prompt: string;
    rubric: RubricConcept[];
    answer: string;
    model?: string;
  },
  deps: { fetch?: typeof fetch; apiKey?: string; sleep?: typeof sleep } = {},
): Promise<FreeTextMarkResult | null> {
  const { prompt, rubric, answer } = params;
  const model = params.model ?? MARKING_MODEL;
  const doFetch = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;
  const apiKey = deps.apiKey ?? process.env.GROQ_API_KEY;

  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  if (rubric.length === 0) return null;

  // an empty answer needs no model call — it earns nothing by definition
  if (answer.trim() === "") {
    return {
      marks: 0,
      concepts: rubric.map((c) => ({ id: c.id, present: false, why: "blank answer" })),
      model: "none",
    };
  }

  const body = JSON.stringify({
    model,
    temperature: 0,
    max_completion_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: MARKING_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify(
          {
            question: prompt,
            rubric: rubric.map((c) => ({ id: c.id, desc: c.desc, marks: c.marks })),
            student_answer: answer,
          },
          null,
          0,
        ),
      },
    ],
  });

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await doFetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) return null;
      await wait(500 * 2 ** (attempt - 1));
      continue;
    }

    // free tier is 30 req/min — back off rather than hammer
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_ATTEMPTS) return null;
      const retryAfter = Number(res.headers?.get?.("retry-after") ?? 0);
      await wait(retryAfter > 0 ? retryAfter * 1000 : 800 * 2 ** (attempt - 1));
      continue;
    }
    if (!res.ok) return null;

    let content: string;
    try {
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      content = json.choices?.[0]?.message?.content ?? "";
    } catch {
      return null;
    }

    const concepts = parseModelReply(content, rubric);
    if (concepts) {
      return { marks: marksFromConcepts(rubric, concepts), concepts, model };
    }
    if (attempt === MAX_ATTEMPTS) return null;
    await wait(300);
  }
  return null;
}
