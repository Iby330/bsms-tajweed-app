import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: vi.fn(), supabaseServer: vi.fn() }));

import { revalidatePath } from "next/cache";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { approveBankQuestion, archiveBankQuestion, updateBankQuestion } from "./bank-actions";

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

const eqId = (c: Call) => c.filters.find((f) => f[0] === "eq" && f[1] === "id")?.[2];
const writes = (calls: Call[]) => calls.filter((c) => ["insert", "update", "delete", "upsert", "rpc"].includes(c.op));

const ME = "11111111-1111-4111-8111-111111111111";
const Q = "66666666-6666-4666-8666-666666666666";

const ADMIN = { id: ME, role: "teacher", section: "brothers", is_admin: true };
const TEACHER = { ...ADMIN, is_admin: false };

function as(profile: object | null, respond?: (c: Call) => Reply) {
  vi.mocked(currentProfile).mockResolvedValue(profile as never);
  const fake = fakeDb(respond);
  vi.mocked(supabaseServer).mockResolvedValue(fake.db as never);
  return fake.calls;
}

/** One bank question and the topics table; an update returns the row's id as RLS would let it. */
function bankWorld(row: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {
    id: Q, kind: "mcq", review_status: "check", archived: false,
    options: [{ text: "a", image: null, correct: true }, { text: "b", image: null, correct: false }],
    ...row,
  };
  const topics = new Set(["sifaat", "sifaat.ra", "seerah"]);
  const respond = (c: Call): Reply => {
    if (c.table === "exam_bank_topics" && c.op === "select") {
      return { data: topics.has(eqId(c) as string) ? { id: eqId(c) } : null };
    }
    if (c.table === "exam_bank_questions" && c.op === "select") {
      return { data: eqId(c) === Q ? q : null };
    }
    if (c.table === "exam_bank_questions" && c.op === "update") {
      if (eqId(c) !== Q) return { data: [] };
      Object.assign(q, c.args[0]);
      return { data: [{ id: Q }] };
    }
    return {};
  };
  return { q, respond };
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(currentProfile).mockReset();
  vi.mocked(supabaseServer).mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("who may change the bank", () => {
  it("keeps approving and binning for an admin: a teacher is refused, and nothing is written", async () => {
    const { respond } = bankWorld();
    const calls = as(TEACHER, respond);
    for (const r of [
      await approveBankQuestion(Q),
      await archiveBankQuestion(Q, true),
    ]) {
      expect(r).toEqual({ ok: false, error: "Only an admin can change the bank." });
    }
    expect(writes(calls)).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("lets any teacher edit a question, but not its review status or where it was used", async () => {
    const { respond } = bankWorld();
    const calls = as(TEACHER, respond);
    expect(await updateBankQuestion(Q, { marks: 2 })).toEqual({ ok: true });
    expect(writes(calls)).toHaveLength(1);
    const refused = { ok: false, error: "Only an admin can change a question's review status or where it was used." };
    expect(await updateBankQuestion(Q, { review_status: "approved" })).toEqual(refused);
    expect(await updateBankQuestion(Q, { used_in: ["EOT1 26/27"] })).toEqual(refused);
    expect(writes(calls)).toHaveLength(1);
  });

  it("refuses a student and a signed-out caller", async () => {
    as({ id: ME, role: "student", is_admin: false });
    expect(await approveBankQuestion(Q)).toEqual({ ok: false, error: "Teachers only." });
    as(null);
    expect(await archiveBankQuestion(Q, true)).toEqual({ ok: false, error: "Teachers only." });
  });

  it("treats an update RLS swallowed (no rows back) as a failure", async () => {
    const calls = as(ADMIN, (c) => (c.op === "update" ? { data: [] } : {}));
    expect(await approveBankQuestion(Q)).toEqual({ ok: false, error: "Nothing changed. Check you are still signed in as a teacher." });
    expect(writes(calls)[0].returning).toEqual(["id"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid before asking anyone", async () => {
    const calls = as(ADMIN);
    expect(await approveBankQuestion("nope")).toEqual({ ok: false, error: "That question isn't in the bank." });
    expect(calls).toEqual([]);
  });
});

describe("approveBankQuestion", () => {
  it("sets the status to approved and nothing else", async () => {
    const { q, respond } = bankWorld();
    const calls = as(ADMIN, respond);
    expect(await approveBankQuestion(Q)).toEqual({ ok: true });
    const [w] = writes(calls);
    expect(w.table).toBe("exam_bank_questions");
    expect(w.args[0]).toEqual({ review_status: "approved" });
    expect(q.review_status).toBe("approved");
    expect(revalidatePath).toHaveBeenCalledWith("/teacher/exam-builder", "layout");
  });
});

describe("archiveBankQuestion", () => {
  it("bins and restores", async () => {
    const { q, respond } = bankWorld();
    as(ADMIN, respond);
    expect(await archiveBankQuestion(Q, true)).toEqual({ ok: true });
    expect(q.archived).toBe(true);
    expect(await archiveBankQuestion(Q, false)).toEqual({ ok: true });
    expect(q.archived).toBe(false);
  });

  it("wants a real yes or no", async () => {
    const calls = as(ADMIN);
    expect(await archiveBankQuestion(Q, "yes" as never)).toEqual({ ok: false, error: "Bin it or restore it?" });
    expect(writes(calls)).toEqual([]);
  });
});

describe("updateBankQuestion", () => {
  it("refuses bad marks", async () => {
    const calls = as(ADMIN, bankWorld().respond);
    for (const marks of [0, 0.3, 101, -1, "2"]) {
      const r = await updateBankQuestion(Q, { marks } as never);
      expect(r).toEqual({ ok: false, error: "Marks must be blank, or between 0.5 and 100 in halves." });
    }
    expect(writes(calls)).toEqual([]);
  });

  it("lets marks be cleared to blank", async () => {
    const { q, respond } = bankWorld({ marks: 2 });
    as(ADMIN, respond);
    expect(await updateBankQuestion(Q, { marks: null })).toEqual({ ok: true });
    expect(q.marks).toBeNull();
  });

  it("refuses a topic that is not in the bank", async () => {
    const calls = as(ADMIN, bankWorld().respond);
    expect(await updateBankQuestion(Q, { topic_id: "sifaat.nope" })).toEqual({
      ok: false, error: "That topic isn't in the bank.",
    });
    expect(writes(calls)).toEqual([]);
  });

  it("writes a known topic, the labels and the status it is given", async () => {
    const { q, respond } = bankWorld();
    as(ADMIN, respond);
    const r = await updateBankQuestion(Q, {
      topic_id: "sifaat.ra", used_in: [" EOT2 25/26 ", "eot2 25/26", "EOY 25/26"], review_status: "approved",
    });
    expect(r).toEqual({ ok: true });
    expect(q.topic_id).toBe("sifaat.ra");
    expect(q.used_in).toEqual(["EOT2 25/26", "EOY 25/26"]);
    expect(q.review_status).toBe("approved");
  });

  it("refuses multiple choice with fewer than two options, judged against the stored kind", async () => {
    const calls = as(ADMIN, bankWorld().respond);
    const r = await updateBankQuestion(Q, { options: [{ text: "only", image: null, correct: true }] });
    expect(r).toEqual({ ok: false, error: "A multiple-choice question needs at least two options." });
    expect(writes(calls)).toEqual([]);
  });

  it("drops the options when a question becomes short answer", async () => {
    const { q, respond } = bankWorld();
    as(ADMIN, respond);
    expect(await updateBankQuestion(Q, { kind: "short" })).toEqual({ ok: true });
    expect(q.kind).toBe("short");
    expect(q.options).toBeNull();
  });

  it("refuses an empty prompt and an empty patch", async () => {
    as(ADMIN, bankWorld().respond);
    expect(await updateBankQuestion(Q, { prompt: "  " })).toEqual({ ok: false, error: "The question can't be empty." });
    expect(await updateBankQuestion(Q, {})).toEqual({ ok: false, error: "Nothing to change." });
  });
});
