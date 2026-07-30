/**
 * Live end-to-end check: real Supabase rows + real Groq calls.
 * Excluded from the normal suite (see vitest.config include) — run with:
 *   npx vitest run --config vitest.live.config.ts
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { scoreObjective, parseOptions, parseRubric } from "./objective";
import { markFreeText } from "./llm";

const env: Record<string, string> = {};
for (const l of readFileSync("./.env.local", "utf8").split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}

describe("live marking pipeline", () => {
  it("marks a real submission end to end", async () => {
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: sub } = await db
      .from("submissions").select("id, homework_id").eq("status", "submitted").limit(1).single();
    expect(sub).toBeTruthy();

    const { data: answers } = await db
      .from("answers").select("id, question_id, response").eq("submission_id", sub!.id);
    const { data: questions } = await db
      .from("questions")
      .select("id, qtype, scoring, points, prompt, is_bonus, is_task, options, rubric")
      .eq("homework_id", sub!.homework_id);
    const byId = new Map(questions!.map((q) => [q.id, q]));

    let objective = 0, llm = 0, manual = 0, total = 0;
    for (const a of answers!) {
      const q = byId.get(a.question_id)!;
      const mq = {
        qtype: q.qtype as never, scoring: q.scoring as never, points: Number(q.points),
        is_task: q.is_task, options: parseOptions(q.options), rubric: parseRubric(q.rubric),
      };
      let marks = scoreObjective(mq, a.response);
      if (marks !== null) objective++;
      else if (mq.rubric?.length) {
        const text = typeof a.response === "object" && a.response
          ? String((a.response as { text?: unknown }).text ?? "") : "";
        const t0 = Date.now();
        const r = await markFreeText(
          { prompt: q.prompt, rubric: mq.rubric, answer: text },
          { apiKey: env.GROQ_API_KEY },
        );
        if (r) {
          marks = r.marks; llm++;
          console.log(`  LLM ${Date.now() - t0}ms "${text.slice(0, 40)}" → ${r.marks}/${q.points} [${r.concepts.map((c) => (c.present ? "✓" : "✗")).join("")}]`);
        } else manual++;
      } else manual++;
      total += marks ?? 0;
    }

    const { data: hw } = await db
      .from("homeworks").select("number, total_marks").eq("id", sub!.homework_id).single();
    console.log(`\nHW ${hw!.number}: objective=${objective} llm=${llm} manual=${manual}`);
    console.log(`total marks ${total} / ${hw!.total_marks}`);

    expect(objective).toBeGreaterThan(0);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(total).toBeLessThanOrEqual(Number(hw!.total_marks) + 10);
  }, 180_000);
});
