import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: vi.fn(), supabaseServer: vi.fn() }));

import { revalidatePath } from "next/cache";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  addBlankItem, addItemFromBank, addSection, createPaper, deletePaper, moveItem, moveItemToSection, moveSection,
  removeItem, removeSection, setPaperFinal, updateItem, updatePaper, updateSection,
} from "./actions";
import { DEFAULT_NOTES, DEFAULT_SECTIONS } from "./labels";

// ── A recording stand-in for the supabase-js query builder ─────────────────

type Call = {
  table: string;
  op: string;
  args: unknown[];
  filters: [string, ...unknown[]][];
  returning?: unknown[];
};
type Reply = { data?: unknown; error?: { message: string; code?: string } | null };

function fakeDb(respond: (c: Call) => Reply = () => ({})) {
  const calls: Call[] = [];
  const run = (c: Call) => {
    calls.push(c);
    const r = respond(c);
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
  };
  const builder = (c: Call) => {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "insert", "update", "delete", "upsert"]) {
      b[op] = (...a: unknown[]) => {
        if (op === "select" && c.op !== "select") c.returning = a;
        else { c.op = op; c.args = a; }
        return b;
      };
    }
    for (const f of ["eq", "is", "in", "not", "gt", "neq", "order", "range", "limit", "maybeSingle", "single"]) {
      b[f] = (...a: unknown[]) => { c.filters.push([f, ...a]); return b; };
    }
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run(c).then(res, rej);
    return b;
  };
  const db = {
    from: (table: string) => builder({ table, op: "select", args: [], filters: [] }),
    rpc: (name: string, args: unknown) => builder({ table: name, op: "rpc", args: [args], filters: [] }),
  };
  return { db, calls };
}

const has = (c: Call, ...f: unknown[]) => c.filters.some((x) => JSON.stringify(x) === JSON.stringify(f));
const eqId = (c: Call) => c.filters.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
/** The writes to the paper's own rows, without the "Edited" stamp. */
const contentUpdates = (calls: Call[]) =>
  calls.filter((c) => c.op === "update" && c.table !== "exam_papers").map((c) => [eqId(c), c.args[0]]);
/** The one "Edited" stamp an action leaves: an update of exam_papers' updated_at, on this paper, last. */
function expectTouched(calls: Call[], paperId = PAPER) {
  const touches = calls.filter((c) => c.table === "exam_papers" && c.op === "update");
  expect(touches).toHaveLength(1);
  expect(Object.keys(touches[0].args[0] as object)).toEqual(["updated_at"]);
  expect(typeof (touches[0].args[0] as { updated_at: unknown }).updated_at).toBe("string");
  expect(has(touches[0], "eq", "id", paperId)).toBe(true);
  expect(writes(calls).at(-1)).toBe(touches[0]);
}
const writes = (calls: Call[]) => calls.filter((c) => ["insert", "update", "delete", "upsert", "rpc"].includes(c.op));

const ME = "11111111-1111-4111-8111-111111111111";
const PAPER = "22222222-2222-4222-8222-222222222222";
const OTHER_PAPER = "33333333-3333-4333-8333-333333333333";
const SEC_A = "44444444-4444-4444-8444-444444444444";
const SEC_B = "55555555-5555-4555-8555-555555555555";
const BANK_Q = "66666666-6666-4666-8666-666666666666";
const ITEM = "77777777-7777-4777-8777-777777777777";
const ITEM_2 = "88888888-8888-4888-8888-888888888888";
const ITEM_3 = "99999999-9999-4999-8999-999999999999";
const PRACTICAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const TEACHER = { id: ME, role: "teacher", section: "brothers", is_admin: false };

function as(profile: object | null, respond?: (c: Call) => Reply) {
  vi.mocked(currentProfile).mockResolvedValue(profile as never);
  const fake = fakeDb(respond);
  vi.mocked(supabaseServer).mockResolvedValue(fake.db as never);
  return fake.calls;
}

/** A small paper: draft unless told otherwise, sections A (questions), B (questions), C (practical). */
function paperWorld(opts: { status?: "draft" | "final" } = {}) {
  const status = opts.status ?? "draft";
  const sections: Record<string, { id: string; paper_id: string; kind: string; position: number }> = {
    [SEC_A]: { id: SEC_A, paper_id: PAPER, kind: "questions", position: 1 },
    [SEC_B]: { id: SEC_B, paper_id: PAPER, kind: "questions", position: 2 },
    [PRACTICAL]: { id: PRACTICAL, paper_id: PAPER, kind: "practical", position: 3 },
  };
  const items: Record<string, { id: string; paper_id: string; section_id: string; position: number; kind: string; options: unknown }> = {
    [ITEM]: { id: ITEM, paper_id: PAPER, section_id: SEC_A, position: 1, kind: "mcq", options: [] },
    [ITEM_2]: { id: ITEM_2, paper_id: PAPER, section_id: SEC_A, position: 2, kind: "mcq", options: [] },
    [ITEM_3]: { id: ITEM_3, paper_id: PAPER, section_id: SEC_A, position: 3, kind: "short", options: null },
  };
  return (c: Call): Reply => {
    if (c.table === "exam_papers" && c.op === "select") {
      return { data: eqId(c) === PAPER ? { id: PAPER, status } : null };
    }
    if (c.table === "exam_paper_sections" && c.op === "select") {
      const id = eqId(c);
      if (id) return { data: sections[id as string] ?? null };
      const paperId = c.filters.find((f) => f[0] === "eq" && f[1] === "paper_id")?.[2];
      const rows = Object.values(sections).filter((s) => s.paper_id === paperId).sort((a, b) => a.position - b.position);
      return { data: has(c, "limit", 1) ? rows.reverse().slice(0, 1) : rows };
    }
    if (c.table === "exam_paper_items" && c.op === "select") {
      const id = eqId(c);
      if (id) return { data: items[id as string] ?? null };
      const sectionId = c.filters.find((f) => f[0] === "eq" && f[1] === "section_id")?.[2];
      if (sectionId) {
        const rows = Object.values(items).filter((i) => i.section_id === sectionId).sort((a, b) => a.position - b.position);
        return { data: has(c, "limit", 1) ? [...rows].reverse().slice(0, 1) : rows };
      }
      return { data: [] };
    }
    if (c.table === "exam_paper_items" && c.op === "update") {
      const row = items[eqId(c) as string];
      if (row) Object.assign(row, c.args[0]);
      return {};
    }
    if (c.table === "exam_paper_items" && c.op === "delete") {
      delete items[eqId(c) as string];
      return {};
    }
    return {};
  };
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(currentProfile).mockReset();
  vi.mocked(supabaseServer).mockReset();
});
afterEach(() => vi.clearAllMocks());

// ── papers ─────────────────────────────────────────────────────────────────

describe("createPaper", () => {
  it("inserts the paper with last year's notes and its three sections", async () => {
    const calls = as(TEACHER, (c) => (c.table === "exam_papers" && c.op === "insert" ? { data: { id: PAPER } } : {}));
    await expect(createPaper()).resolves.toEqual({ ok: true, id: PAPER });

    const paper = calls.find((c) => c.table === "exam_papers" && c.op === "insert")!;
    expect(paper.args[0]).toEqual({ owner_id: ME, notes: [...DEFAULT_NOTES] });
    const secs = calls.find((c) => c.table === "exam_paper_sections" && c.op === "insert")!;
    expect(secs.args[0]).toEqual(DEFAULT_SECTIONS.map((s, i) => ({
      paper_id: PAPER, position: i + 1, title: s.title, kind: s.kind, practical: s.practical,
    })));
    expect(revalidatePath).toHaveBeenCalledWith("/teacher/exam-builder");
  });

  it("removes the paper again if its sections fail", async () => {
    const calls = as(TEACHER, (c) => {
      if (c.table === "exam_papers" && c.op === "insert") return { data: { id: PAPER } };
      if (c.table === "exam_paper_sections") return { error: { message: "boom" } };
      return {};
    });
    await expect(createPaper()).resolves.toEqual({ ok: false, error: "boom" });
    const del = calls.find((c) => c.table === "exam_papers" && c.op === "delete")!;
    expect(has(del, "eq", "id", PAPER)).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is for teachers only, and says so rather than throwing", async () => {
    const calls = as({ ...TEACHER, role: "student" });
    await expect(createPaper()).resolves.toEqual({ ok: false, error: "Teachers only." });
    as(null);
    await expect(createPaper()).resolves.toEqual({ ok: false, error: "Teachers only." });
    expect(calls).toEqual([]);
  });
});

describe("updatePaper", () => {
  it("writes the cleaned patch and bumps updated_at", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(updatePaper(PAPER, { title: "  EOT1 Exam ", notes: ["One", " "] })).resolves.toEqual({ ok: true });
    const up = calls.find((c) => c.table === "exam_papers" && c.op === "update")!;
    expect(up.args[0]).toMatchObject({ title: "EOT1 Exam", notes: ["One"] });
    expect(typeof (up.args[0] as { updated_at: unknown }).updated_at).toBe("string");
    expect(has(up, "eq", "id", PAPER)).toBe(true);
  });

  it("rejects a malformed id or a bad patch before touching anything", async () => {
    as(TEACHER, paperWorld());
    await expect(updatePaper("x),or(id.neq.0", { title: "T" })).resolves.toMatchObject({ ok: false });
    await expect(updatePaper(PAPER, { title: " " })).resolves.toEqual({ ok: false, error: "The paper needs a title." });
    expect(currentProfile).not.toHaveBeenCalled();
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("says when the paper isn't visible", async () => {
    as(TEACHER, paperWorld());
    await expect(updatePaper(OTHER_PAPER, { title: "T" })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/isn't yours/) });
    await expect(updatePaper(OTHER_PAPER, { name: "Advanced" })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/isn't yours/) });
  });

  it("renames a draft, and a blank name clears it", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(updatePaper(PAPER, { name: "  " })).resolves.toEqual({ ok: true });
    const up = calls.find((c) => c.table === "exam_papers" && c.op === "update")!;
    expect(up.args[0]).toMatchObject({ name: "" });
  });
});

describe("a final paper", () => {
  it("refuses every change to its content", async () => {
    const calls = as(TEACHER, paperWorld({ status: "final" }));
    const FINAL = { ok: false, error: "Reopen the paper to change it." };
    await expect(updatePaper(PAPER, { title: "T" })).resolves.toEqual(FINAL);
    await expect(addSection(PAPER, "questions")).resolves.toEqual(FINAL);
    await expect(updateSection(SEC_A, { title: "A" })).resolves.toEqual(FINAL);
    await expect(removeSection(SEC_A)).resolves.toEqual(FINAL);
    await expect(moveSection(SEC_B, "up")).resolves.toEqual(FINAL);
    await expect(addItemFromBank(PAPER, SEC_A, BANK_Q)).resolves.toEqual(FINAL);
    await expect(addBlankItem(PAPER, SEC_A, "short")).resolves.toEqual(FINAL);
    await expect(updateItem(ITEM, { marks: 2 })).resolves.toEqual(FINAL);
    await expect(removeItem(ITEM)).resolves.toEqual(FINAL);
    await expect(moveItem(ITEM_2, "up")).resolves.toEqual(FINAL);
    await expect(moveItemToSection(ITEM, SEC_B)).resolves.toEqual(FINAL);
    await expect(deletePaper(PAPER)).resolves.toEqual({ ok: false, error: "Reopen the paper before deleting it." });
    expect(writes(calls)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("can still be renamed: a name-only change goes through, anything with it is refused", async () => {
    const calls = as(TEACHER, paperWorld({ status: "final" }));
    await expect(updatePaper(PAPER, { name: " Advanced " })).resolves.toEqual({ ok: true });
    const up = calls.find((c) => c.table === "exam_papers" && c.op === "update")!;
    expect(Object.keys(up.args[0] as object).sort()).toEqual(["name", "updated_at"]);
    expect(up.args[0]).toMatchObject({ name: "Advanced" });
    expect(has(up, "eq", "id", PAPER)).toBe(true);

    const before = writes(calls).length;
    await expect(updatePaper(PAPER, { name: "Lower", title: "T" })).resolves.toEqual({
      ok: false, error: "Reopen the paper to change it.",
    });
    await expect(updatePaper(PAPER, { name: "Lower", notes: [] })).resolves.toEqual({
      ok: false, error: "Reopen the paper to change it.",
    });
    expect(writes(calls)).toHaveLength(before);
  });

  it("can still be reopened", async () => {
    const calls = as(TEACHER, (c) => (c.op === "rpc" ? { data: "EOT1 26/27" } : {}));
    await expect(setPaperFinal(PAPER, false)).resolves.toEqual({ ok: true, label: "EOT1 26/27" });
    expect(calls[0]).toMatchObject({ table: "exam_paper_set_final", args: [{ p_paper: PAPER, p_final: false }] });
  });
});

describe("setPaperFinal", () => {
  it("passes the database's refusal on", async () => {
    as(TEACHER, () => ({ error: { message: "Not your paper." } }));
    await expect(setPaperFinal(PAPER, true)).resolves.toEqual({ ok: false, error: "Not your paper." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("deletePaper", () => {
  it("deletes a draft and says when nothing went", async () => {
    let gone = false;
    const calls = as(TEACHER, (c) => {
      if (c.table === "exam_papers" && c.op === "delete") {
        const r = { data: gone ? [] : [{ id: PAPER }] };
        gone = true;
        return r;
      }
      return paperWorld()(c);
    });
    await expect(deletePaper(PAPER)).resolves.toEqual({ ok: true });
    expect(has(calls.find((c) => c.op === "delete")!, "eq", "id", PAPER)).toBe(true);
    await expect(deletePaper(PAPER)).resolves.toMatchObject({ ok: false });
  });
});

// ── sections ───────────────────────────────────────────────────────────────

describe("sections", () => {
  it("addSection appends a practical table at the next position", async () => {
    const world = paperWorld();
    const calls = as(TEACHER, (c) =>
      c.table === "exam_paper_sections" && c.op === "insert"
        ? { data: { id: SEC_B, ...(c.args[0] as object) } }
        : world(c));
    const res = await addSection(PAPER, "practical");
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toEqual({
      paper_id: PAPER, position: 4, title: "Practical Component", kind: "practical",
      practical: DEFAULT_SECTIONS[2].practical,
    });
    expect(res).toMatchObject({ ok: true, section: { kind: "practical", practical: { rows: 3, marks: 9 } } });
    expectTouched(calls);
  });

  it("updateSection and removeSection stamp the paper as edited", async () => {
    let calls = as(TEACHER, paperWorld());
    await expect(updateSection(SEC_A, { title: "Section A" })).resolves.toEqual({ ok: true });
    expectTouched(calls);
    calls = as(TEACHER, paperWorld());
    await expect(removeSection(SEC_B)).resolves.toEqual({ ok: true });
    expectTouched(calls);
  });

  it("a failed stamp does not fail the edit", async () => {
    const world = paperWorld();
    as(TEACHER, (c) => (c.table === "exam_papers" && c.op === "update" ? { error: { message: "boom" } } : world(c)));
    await expect(updateSection(SEC_A, { title: "Section A" })).resolves.toEqual({ ok: true });
  });

  it("updateSection refuses a table on a question section", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(updateSection(SEC_A, { practical: { rows: 3, marks: 9, columns: ["Verse"] } }))
      .resolves.toMatchObject({ ok: false, error: expect.stringMatching(/practical/) });
    expect(writes(calls)).toEqual([]);
  });

  it("moveSection swaps and renumbers", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(moveSection(SEC_B, "up")).resolves.toEqual({ ok: true });
    expect(contentUpdates(calls)).toEqual([[SEC_B, { position: 1 }], [SEC_A, { position: 2 }]]);
    expectTouched(calls);
  });
});

// ── questions on the paper ─────────────────────────────────────────────────

describe("addItemFromBank", () => {
  const bankRow = {
    id: BANK_Q, kind: "short", prompt: "Define Ghunna.", prompt_images: ["bank/a.png"],
    prompt_quran: { surah: 103, from_ayah: 1, to_ayah: 3 }, options: null, select_many: false,
    answer: "A nasal sound (1)", marks: null, archived: false,
  };
  const respond = (extra: (c: Call) => Reply | undefined = () => undefined) => {
    const world = paperWorld();
    return (c: Call): Reply => {
      const e = extra(c);
      if (e) return e;
      if (c.table === "exam_bank_questions") return { data: bankRow };
      if (c.table === "exam_paper_items" && c.op === "select" && has(c, "eq", "bank_question_id", BANK_Q)) return { data: [] };
      if (c.table === "exam_paper_items" && c.op === "insert") return { data: { id: ITEM, ...(c.args[0] as object) } };
      return world(c);
    };
  };

  it("copies the question's content, defaults marks to 1 and appends it", async () => {
    const calls = as(TEACHER, respond());
    const res = await addItemFromBank(PAPER, SEC_A, BANK_Q);
    const ins = calls.find((c) => c.table === "exam_paper_items" && c.op === "insert")!;
    expect(ins.args[0]).toEqual({
      paper_id: PAPER, section_id: SEC_A, position: 4, bank_question_id: BANK_Q,
      kind: "short", prompt: "Define Ghunna.", prompt_images: ["bank/a.png"],
      prompt_quran: { surah: 103, from_ayah: 1, to_ayah: 3 }, options: null, select_many: false,
      answer: "A nasal sound (1)", marks: 1, answer_lines: 2,
    });
    expect(res).toMatchObject({ ok: true, item: { id: ITEM, kind: "short", marks: 1, prompt_quran: { surah: 103 } } });
    expectTouched(calls);
    // Saves from the workspace never re-render it: no revalidation.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps the bank's marks and gives an mcq no writing lines", async () => {
    const calls = as(TEACHER, respond((c) =>
      c.table === "exam_bank_questions"
        ? { data: { ...bankRow, kind: "mcq", marks: 2, options: [{ text: "A", image: null, correct: true }] } }
        : undefined));
    await addItemFromBank(PAPER, SEC_A, BANK_Q);
    const ins = calls.find((c) => c.table === "exam_paper_items" && c.op === "insert")!;
    expect(ins.args[0]).toMatchObject({ kind: "mcq", marks: 2, answer_lines: 0, options: [{ text: "A", image: null, correct: true }] });
  });

  it("refuses a section from another paper", async () => {
    const calls = as(TEACHER, respond((c) =>
      c.table === "exam_paper_sections" && eqId(c) === SEC_B
        ? { data: { id: SEC_B, paper_id: OTHER_PAPER, kind: "questions", position: 1 } }
        : undefined));
    await expect(addItemFromBank(PAPER, SEC_B, BANK_Q)).resolves.toEqual({ ok: false, error: "That section isn't on this paper." });
    expect(writes(calls)).toEqual([]);
  });

  it("refuses the practical section, an archived question and a second copy", async () => {
    as(TEACHER, respond());
    await expect(addItemFromBank(PAPER, PRACTICAL, BANK_Q)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/practical/) });
    as(TEACHER, respond((c) => (c.table === "exam_bank_questions" ? { data: { ...bankRow, archived: true } } : undefined)));
    await expect(addItemFromBank(PAPER, SEC_A, BANK_Q)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/bank/) });
    as(TEACHER, respond((c) =>
      c.table === "exam_paper_items" && has(c, "eq", "bank_question_id", BANK_Q) ? { data: [{ id: ITEM }] } : undefined));
    await expect(addItemFromBank(PAPER, SEC_A, BANK_Q)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/already/) });
  });
});

describe("addBlankItem", () => {
  it("writes an empty multiple choice with four options", async () => {
    const world = paperWorld();
    const calls = as(TEACHER, (c) =>
      c.table === "exam_paper_items" && c.op === "insert" ? { data: { id: ITEM, ...(c.args[0] as object) } } : world(c));
    const res = await addBlankItem(PAPER, SEC_B, "mcq");
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toMatchObject({
      section_id: SEC_B, position: 1, bank_question_id: null, kind: "mcq", prompt: "New question", marks: 1, answer_lines: 0,
    });
    expect((ins.args[0] as { options: unknown[] }).options).toHaveLength(4);
    expect(res).toMatchObject({ ok: true, item: { kind: "mcq" } });
    expectTouched(calls);
  });
});

describe("updateItem", () => {
  it("rejects bad marks before touching the database", async () => {
    as(TEACHER, paperWorld());
    await expect(updateItem(ITEM, { marks: 0 })).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/0.5 and 100/) });
    await expect(updateItem(ITEM, { marks: 1.25 })).resolves.toMatchObject({ ok: false });
    await expect(updateItem(ITEM, { marks: 101 })).resolves.toMatchObject({ ok: false });
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("writes the cleaned patch", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(updateItem(ITEM, { prompt: " Which rule? ", marks: 1.5, answer: "" })).resolves.toEqual({ ok: true });
    const up = calls.find((c) => c.op === "update")!;
    expect(up.args[0]).toEqual({ prompt: "Which rule?", marks: 1.5, answer: null });
    expect(eqId(up)).toBe(ITEM);
    expectTouched(calls);
  });

  it("gives a question turned multiple choice four empty options", async () => {
    const calls = as(TEACHER, paperWorld());
    await updateItem(ITEM_3, { kind: "mcq" });
    const up = calls.find((c) => c.op === "update")!;
    expect((up.args[0] as { options: unknown[] }).options).toHaveLength(4);
  });
});

describe("moving and removing questions", () => {
  it("moveItem swaps neighbours and renumbers the section", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(moveItem(ITEM_3, "up")).resolves.toEqual({ ok: true });
    expect(contentUpdates(calls)).toEqual([[ITEM_3, { position: 2 }], [ITEM_2, { position: 3 }]]);
    expectTouched(calls);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("moveItem at the top is a no-op", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(moveItem(ITEM, "up")).resolves.toEqual({ ok: true });
    expect(writes(calls)).toEqual([]);
  });

  it("removeItem closes the gap", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(removeItem(ITEM)).resolves.toEqual({ ok: true });
    expect(contentUpdates(calls)).toEqual([[ITEM_2, { position: 1 }], [ITEM_3, { position: 2 }]]);
    expectTouched(calls);
  });

  it("moveItemToSection appends to the target and renumbers both", async () => {
    const calls = as(TEACHER, paperWorld());
    await expect(moveItemToSection(ITEM, SEC_B)).resolves.toEqual({ ok: true });
    expect(contentUpdates(calls)).toEqual([
      [ITEM, { section_id: SEC_B, position: 1 }],
      [ITEM_2, { position: 1 }],
      [ITEM_3, { position: 2 }],
    ]);
    expectTouched(calls);
  });

  it("moveItemToSection refuses the practical section or another paper's", async () => {
    const world = paperWorld();
    const calls = as(TEACHER, (c) =>
      c.table === "exam_paper_sections" && eqId(c) === SEC_B
        ? { data: { id: SEC_B, paper_id: OTHER_PAPER, kind: "questions", position: 1 } }
        : world(c));
    await expect(moveItemToSection(ITEM, PRACTICAL)).resolves.toMatchObject({ ok: false });
    await expect(moveItemToSection(ITEM, SEC_B)).resolves.toEqual({ ok: false, error: "That section isn't on this paper." });
    expect(writes(calls)).toEqual([]);
  });
});
