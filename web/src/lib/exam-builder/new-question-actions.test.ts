import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: vi.fn(), supabaseServer: vi.fn() }));
vi.mock("./images", () => ({
  signExamImages: vi.fn(async (paths: string[]) => Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`]))),
  collectImagePaths: (q: { prompt_images: string[]; options: { image: string | null }[] | null }) =>
    [...q.prompt_images, ...(q.options ?? []).flatMap((o) => (o.image ? [o.image] : []))],
}));

import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { addBankQuestion, signNewQuestionImage } from "./new-question-actions";
import { cleanNewQuestion, isOwnUpload, writtenSource } from "./new-question-validate";

type Call = { table: string; op: string; args: unknown[] };

function fakeDb(respond: (c: Call) => { data?: unknown; error?: { message: string; code?: string } } = () => ({})) {
  const calls: Call[] = [];
  const builder = (c: Call) => {
    const b: Record<string, unknown> = {};
    for (const op of ["select", "insert", "update", "delete"]) {
      b[op] = (...a: unknown[]) => {
        if (!(op === "select" && c.op !== "select")) { c.op = op; c.args = a; }
        return b;
      };
    }
    for (const f of ["eq", "order", "limit", "maybeSingle", "single"]) b[f] = () => b;
    b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      calls.push(c);
      const r = respond(c);
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej);
    };
    return b;
  };
  return { db: { from: (table: string) => builder({ table, op: "select", args: [] }) }, calls };
}

const ME = "11111111-1111-4111-8111-111111111111";
const TEACHER = { id: ME, role: "teacher", full_name: "Ibrahim Ramadan", is_admin: false };
const STUDENT = { id: ME, role: "student", full_name: "A Student", is_admin: false };

function as(profile: object | null, respond?: Parameters<typeof fakeDb>[0]) {
  vi.mocked(currentProfile).mockResolvedValue(profile as never);
  const fake = fakeDb(respond);
  vi.mocked(supabaseServer).mockResolvedValue(fake.db as never);
  return fake.calls;
}

const good = {
  topic_id: "noon.ikhfaa",
  kind: "short",
  prompt: "Which rule applies to the noon in مِنْ تَحْتِهَا?",
  answer: "Ikhfaa (1)",
  marks: 1,
  prompt_images: [`new/${ME}/abc.png`],
};

const world = (c: Call) => {
  if (c.table === "exam_bank_topics") return { data: { id: "noon.ikhfaa" } };
  if (c.table === "exam_bank_questions" && c.op === "insert") {
    return { data: { id: "q1", archived: false, review_note: null, import_key: null, prompt_quran: null, created_at: "", ...(c.args[0] as object) } };
  }
  return {};
};

afterEach(() => vi.clearAllMocks());

describe("addBankQuestion", () => {
  it("refuses anyone who is not a teacher, before touching the database", async () => {
    const calls = as(STUDENT, world);
    await expect(addBankQuestion(good)).resolves.toEqual({ ok: false, error: "Teachers only." });
    expect(calls).toEqual([]);
  });

  it("refuses a question with no topic", async () => {
    as(TEACHER, world);
    await expect(addBankQuestion({ ...good, topic_id: "" })).resolves.toEqual({ ok: false, error: "Pick a topic." });
  });

  it("refuses a multiple choice with fewer than two options", async () => {
    as(TEACHER, world);
    const res = await addBankQuestion({
      ...good, kind: "mcq", options: [{ text: "Ikhfaa", image: null, correct: true }, { text: " ", image: null, correct: false }],
    });
    expect(res).toEqual({ ok: false, error: "A multiple-choice question needs at least two options." });
  });

  it("refuses a picture that is not the caller's own upload", async () => {
    as(TEACHER, world);
    await expect(addBankQuestion({ ...good, prompt_images: ["bank/x.png"] })).resolves.toMatchObject({ ok: false });
    await expect(addBankQuestion({ ...good, prompt_images: ["new/someone-else/x.png"] })).resolves.toMatchObject({ ok: false });
  });

  it("refuses an option picture that is not the caller's own upload, and takes one that is", async () => {
    as(TEACHER, world);
    const mcq = (image: string) => ({
      ...good, kind: "mcq", prompt_images: [],
      options: [{ text: "", image, correct: true }, { text: "", image: null, correct: false, quran: { surah: 2, from_ayah: 8, to_ayah: 8, from_word: 2, to_word: 2 } }],
    });
    await expect(addBankQuestion(mcq("bank/x.png"))).resolves.toMatchObject({ ok: false });
    await expect(addBankQuestion(mcq("new/someone-else/x.png"))).resolves.toMatchObject({ ok: false });
    await expect(addBankQuestion(mcq(`new/${ME}/word.png`))).resolves.toMatchObject({ ok: true });
  });

  it("inserts it as the caller's, clean, with who wrote it and when", async () => {
    const calls = as(TEACHER, world);
    const res = await addBankQuestion(good);
    const ins = calls.find((c) => c.table === "exam_bank_questions" && c.op === "insert")!;
    const row = ins.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      topic_id: "noon.ikhfaa", kind: "short", marks: 1, created_by: ME, review_status: "clean", used_in: [],
      options: null, prompt_images: [`new/${ME}/abc.png`], prompt_quran: null,
    });
    expect(row.sources).toEqual([writtenSource("Ibrahim Ramadan")]);
    expect((row.sources as { label: string }[])[0].label).toMatch(/^Ibrahim Ramadan, [A-Z][a-z]{2,3} \d{4}$/);
    expect(res).toMatchObject({ ok: true, item: null, question: { id: "q1", imageUrls: { [`new/${ME}/abc.png`]: expect.any(String) } } });
  });

  it("refuses a topic the bank doesn't have", async () => {
    as(TEACHER, (c) => (c.table === "exam_bank_topics" ? { data: null } : world(c)));
    await expect(addBankQuestion(good)).resolves.toEqual({ ok: false, error: "That topic isn't in the bank." });
  });
});

describe("signNewQuestionImage", () => {
  it("signs only the caller's own uploads", async () => {
    as(TEACHER);
    await expect(signNewQuestionImage(`new/${ME}/abc.png`)).resolves.toMatchObject({ ok: true });
    await expect(signNewQuestionImage("bank/exam1/a.png")).resolves.toMatchObject({ ok: false });
    await expect(signNewQuestionImage(`new/${ME}/../x.png`)).resolves.toMatchObject({ ok: false });
  });
});

describe("the pure checks", () => {
  it("isOwnUpload wants new/<me>/<file>", () => {
    expect(isOwnUpload(`new/${ME}/a-b_1.png`, ME)).toBe(true);
    expect(isOwnUpload(`new/${ME}/sub/a.png`, ME)).toBe(false);
    expect(isOwnUpload("new/other/a.png", ME)).toBe(false);
  });

  it("cleanNewQuestion drops empty options and gives a short answer none", () => {
    const mcq = cleanNewQuestion({
      ...good, prompt_images: [], kind: "mcq",
      options: [{ text: "A", image: null, correct: true }, { text: "", image: null, correct: false }, { text: "B", image: null, correct: false }],
    });
    expect(mcq).toMatchObject({ ok: true, value: { options: [{ text: "A" }, { text: "B" }] } });
    const short = cleanNewQuestion({ ...good, options: [{ text: "A", image: null, correct: true }] });
    expect(short).toMatchObject({ ok: true, value: { options: null } });
    expect(cleanNewQuestion({ ...good, marks: undefined })).toMatchObject({ ok: false });
  });

  it("cleanNewQuestion carries a typeset ayah, and refuses one that isn't a range", () => {
    const q = cleanNewQuestion({ ...good, prompt_images: [], prompt_quran: { surah: 112, from_ayah: 1, to_ayah: 4 } });
    expect(q).toMatchObject({ ok: true, value: { prompt_images: [], prompt_quran: { surah: 112, from_ayah: 1, to_ayah: 4 } } });
    expect(cleanNewQuestion(good)).toMatchObject({ ok: true, value: { prompt_quran: null } });
    expect(cleanNewQuestion({ ...good, prompt_quran: { surah: 115, from_ayah: 1, to_ayah: 1 } })).toMatchObject({ ok: false });
  });

  it("addBankQuestion stores the typeset ayah on the bank row", async () => {
    const calls = as(TEACHER, world);
    await addBankQuestion({ ...good, prompt_images: [], prompt_quran: { surah: 31, from_ayah: 19, to_ayah: 19 } });
    const row = calls.find((c) => c.table === "exam_bank_questions" && c.op === "insert")!.args[0] as Record<string, unknown>;
    expect(row.prompt_quran).toEqual({ surah: 31, from_ayah: 19, to_ayah: 19 });
  });
});
