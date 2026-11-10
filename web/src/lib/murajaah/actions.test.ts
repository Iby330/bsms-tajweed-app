import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ currentProfile: vi.fn(), supabaseServer: vi.fn() }));

import { revalidatePath } from "next/cache";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import {
  addMark, discardDraft, finishClock, pauseClock, removeMark, saveTargets, setMarkTypes,
  startClock, startDraft, submitSession, tickCheckpoint, untickCheckpoint,
} from "./actions";
import { DEFAULT_CLASS_TARGET } from "./targets";

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

const has = (c: Call, ...f: unknown[]) =>
  c.filters.some((x) => JSON.stringify(x) === JSON.stringify(f));

const ME = "11111111-1111-4111-8111-111111111111";
const RECITER = "22222222-2222-4222-8222-222222222222";
const CLASS = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const MARK = "55555555-5555-4555-8555-555555555555";
const CP = "66666666-6666-4666-8666-666666666666";
const TEACHER = "77777777-7777-4777-8777-777777777777";

const LISTENER = { id: ME, role: "student", section: "ustadhs", class_id: CLASS };

function as(profile: object | null, respond?: (c: Call) => Reply) {
  vi.mocked(currentProfile).mockResolvedValue(profile as never);
  const fake = fakeDb(respond);
  vi.mocked(supabaseServer).mockResolvedValue(fake.db as never);
  return fake.calls;
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(currentProfile).mockReset();
  vi.mocked(supabaseServer).mockReset();
});
afterEach(() => vi.clearAllMocks());

// ── startDraft ──────────────────────────────────────────────────────────

describe("startDraft", () => {
  it("rejects a malformed id before touching anything", async () => {
    as(LISTENER);
    await expect(startDraft("x),or(id.neq.0", "juz", [30])).rejects.toThrow("Unknown student.");
    expect(currentProfile).not.toHaveBeenCalled();
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("rejects a bad portion", async () => {
    as(LISTENER);
    await expect(startDraft(RECITER, "juz", [31])).rejects.toThrow(/between 1 and 30/);
    await expect(startDraft(RECITER, "juz", [])).rejects.toThrow(/between 1 and 30/);
    await expect(startDraft(RECITER, "page" as never, [1])).rejects.toThrow(/hizb, juz or surah/);
  });

  it("is only for the ustadhs class's students", async () => {
    as({ ...LISTENER, section: "brothers" });
    await expect(startDraft(RECITER, "juz", [30])).rejects.toThrow(/Esteemed Ustadhs/);
    as({ ...LISTENER, role: "teacher" });
    await expect(startDraft(RECITER, "juz", [30])).rejects.toThrow(/Esteemed Ustadhs/);
    as(null);
    await expect(startDraft(RECITER, "juz", [30])).rejects.toThrow(/Sign in/);
  });

  it("refuses to listen to yourself", async () => {
    as(LISTENER);
    await expect(startDraft(ME, "juz", [30])).rejects.toThrow(/classmate/);
  });

  it("snapshots the target and override, replaces the old draft, and returns the id", async () => {
    const calls = as(LISTENER, (c) => {
      if (c.table === "murajaah_targets") {
        return { data: { ideal_min: 12, good_min: 16, acceptable_min: 22, limit_hizb: 3, limit_juz: 4, limit_surah10: 3 } };
      }
      if (c.table === "murajaah_target_overrides") return { data: { limit_hizb: null, limit_juz: 6, limit_surah10: null, note: null } };
      if (c.table === "murajaah_sessions" && c.op === "insert") return { data: { id: SESSION } };
      return {};
    });
    await expect(startDraft(RECITER, "juz", [30, 28, 30])).resolves.toBe(SESSION);

    const del = calls.find((c) => c.table === "murajaah_sessions" && c.op === "delete")!;
    expect(has(del, "eq", "listener_id", ME) && has(del, "is", "submitted_at", null)).toBe(true);
    const ov = calls.find((c) => c.table === "murajaah_target_overrides")!;
    expect(has(ov, "eq", "student_id", RECITER) && has(ov, "eq", "class_id", CLASS)).toBe(true);

    const ins = calls.find((c) => c.table === "murajaah_sessions" && c.op === "insert")!;
    expect(ins.args[0]).toEqual({
      class_id: CLASS, listener_id: ME, reciter_id: RECITER,
      portion_kind: "juz", portion_ns: [28, 30], portion_label: "Juz 28 + 30",
      hizb_eq: 4, mistake_limit: 12, band_minutes: { ideal: 12, good: 16, acceptable: 22 },
    });
    // The old draft goes before the new one is made.
    expect(calls.indexOf(del)).toBeLessThan(calls.indexOf(ins));
    expect(revalidatePath).toHaveBeenCalledWith("/hifdh");
  });

  it("uses the defaults with no target row", async () => {
    const calls = as(LISTENER, (c) => (c.op === "insert" ? { data: { id: SESSION } } : {}));
    await startDraft(RECITER, "surah", [67, 68]);
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toMatchObject({
      portion_label: "Al-Mulk + Al-Qalam", hizb_eq: 0.6, mistake_limit: 2,
      band_minutes: DEFAULT_CLASS_TARGET.minutes,
    });
  });

  it("says plainly when RLS refuses the pair", async () => {
    as(LISTENER, (c) => (c.op === "insert" ? { error: { message: "new row violates row-level security policy", code: "42501" } } : {}));
    await expect(startDraft(RECITER, "hizb", [1])).rejects.toThrow("You can only listen to a classmate.");
  });
});

describe("discardDraft", () => {
  it("deletes only the caller's own draft", async () => {
    const calls = as(LISTENER, () => ({ data: [{ id: SESSION }] }));
    await discardDraft(SESSION);
    const del = calls[0];
    expect(del.op).toBe("delete");
    expect(has(del, "eq", "id", SESSION) && has(del, "eq", "listener_id", ME) && has(del, "is", "submitted_at", null)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/hifdh");
  });

  it("throws when there was nothing to delete", async () => {
    as(LISTENER, () => ({ data: [] }));
    await expect(discardDraft(SESSION)).rejects.toThrow(/No draft/);
  });
});

// ── The clock ───────────────────────────────────────────────────────────

describe("the clock actions", () => {
  const snap = { elapsed_ms: 0, running_since: "2026-11-10T18:00:00Z", timer_started_at: "2026-11-10T18:00:00Z", finished_at: null, server_now: "2026-11-10T18:00:00Z" };

  it("go through murajaah_clock with the op and return the server's clock", async () => {
    const calls = as(LISTENER, () => ({ data: [snap] }));
    await expect(startClock(SESSION)).resolves.toEqual(snap);
    await pauseClock(SESSION);
    await finishClock(SESSION);
    expect(calls.map((c) => [c.table, c.args[0]])).toEqual([
      ["murajaah_clock", { p_session: SESSION, p_op: "start" }],
      ["murajaah_clock", { p_session: SESSION, p_op: "pause" }],
      ["murajaah_clock", { p_session: SESSION, p_op: "finish" }],
    ]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("pass the database's refusal on", async () => {
    as(LISTENER, () => ({ error: { message: "this session is finished" } }));
    await expect(startClock(SESSION)).rejects.toThrow("this session is finished");
  });

  it("reject a malformed id", async () => {
    as(LISTENER);
    await expect(startClock("nope")).rejects.toThrow("Unknown session.");
  });
});

// ── Marks ───────────────────────────────────────────────────────────────

describe("addMark", () => {
  it("adds a +1 counter mark with no place", async () => {
    const calls = as(LISTENER, () => ({ data: { id: MARK } }));
    await expect(addMark(SESSION, 61_000, null)).resolves.toBe(MARK);
    expect(calls[0].args[0]).toEqual({ session_id: SESSION, at_ms: 61_000, surah_number: null, ayah_number: null, word_position: null });
  });

  it("adds a word or a whole ayah", async () => {
    const calls = as(LISTENER, () => ({ data: { id: MARK } }));
    await addMark(SESSION, 1, { surah: 67, ayah: 30, position: 4 });
    await addMark(SESSION, 2, { surah: 67, ayah: 1, position: null });
    expect(calls[0].args[0]).toMatchObject({ surah_number: 67, ayah_number: 30, word_position: 4 });
    expect(calls[1].args[0]).toMatchObject({ surah_number: 67, ayah_number: 1, word_position: null });
  });

  it("rejects a time off the clock or a place not in the mushaf", async () => {
    as(LISTENER);
    await expect(addMark(SESSION, -1, null)).rejects.toThrow(/session clock/);
    await expect(addMark(SESSION, 1.5, null)).rejects.toThrow(/session clock/);
    await expect(addMark(SESSION, 1, { surah: 67, ayah: 31, position: null })).rejects.toThrow(/not in the mushaf/);
    await expect(addMark(SESSION, 1, { surah: 115, ayah: 1, position: null })).rejects.toThrow(/not in the mushaf/);
    await expect(addMark(SESSION, 1, { surah: 67, ayah: 1, position: 0 })).rejects.toThrow(/not in the mushaf/);
    expect(supabaseServer).not.toHaveBeenCalled();
  });
});

describe("removeMark", () => {
  it("throws when RLS hid the mark", async () => {
    as(LISTENER, () => ({ data: [] }));
    await expect(removeMark(MARK)).rejects.toThrow(/not in a draft/);
  });
});

// ── Checkpoints ─────────────────────────────────────────────────────────

describe("tickCheckpoint", () => {
  const session = (ords: number[]) => (c: Call): Reply => {
    if (c.table === "murajaah_sessions") return { data: { portion_kind: "juz", portion_ns: [28, 30] } };
    if (c.table === "murajaah_checkpoints" && c.op === "select") return { data: ords.map((ord) => ({ ord })) };
    if (c.op === "insert") return { data: { id: CP } };
    return {};
  };

  it("ticks the next automatic checkpoint with its own label", async () => {
    const calls = as(LISTENER, session([1]));
    await expect(tickCheckpoint(SESSION, "auto", 2, "anything", 25 * 60_000)).resolves.toBe(CP);
    const ins = calls.find((c) => c.op === "insert")!;
    expect(ins.args[0]).toEqual({ session_id: SESSION, kind: "auto", ord: 2, label: "End of Juz 28, then Juz 30", at_ms: 25 * 60_000 });
  });

  it("refuses an automatic checkpoint out of order, or past the last", async () => {
    as(LISTENER, session([]));
    await expect(tickCheckpoint(SESSION, "auto", 2, "x", 1)).rejects.toThrow(/in order/);
    as(LISTENER, session([1, 2, 3]));
    await expect(tickCheckpoint(SESSION, "auto", 4, "x", 1)).rejects.toThrow(/already ticked/);
  });

  it("numbers an added checkpoint itself and names a blank one", async () => {
    const calls = as(LISTENER, session([1, 1001]));
    await tickCheckpoint(SESSION, "added", 0, "  ", 5_000);
    expect(calls.find((c) => c.op === "insert")!.args[0]).toMatchObject({ kind: "added", ord: 1002, label: "Checkpoint 2" });
  });

  it("refuses when the draft is not the caller's", async () => {
    as(LISTENER, (c) => (c.table === "murajaah_sessions" ? { data: null } : { data: [] }));
    await expect(tickCheckpoint(SESSION, "added", 0, "x", 1)).rejects.toThrow(/No draft/);
  });
});

describe("untickCheckpoint", () => {
  it("refuses an automatic tick with a later one after it", async () => {
    as(LISTENER, (c) => {
      if (c.op === "select" && has(c, "eq", "id", CP)) return { data: { id: CP, session_id: SESSION, kind: "auto", ord: 1 } };
      if (c.op === "select") return { data: [{ id: "later" }] };
      return { data: [{ id: CP }] };
    });
    await expect(untickCheckpoint(CP)).rejects.toThrow(/latest/);
  });

  it("unticks the latest", async () => {
    const calls = as(LISTENER, (c) => {
      if (c.op === "select" && has(c, "eq", "id", CP)) return { data: { id: CP, session_id: SESSION, kind: "auto", ord: 2 } };
      if (c.op === "select") return { data: [] };
      return { data: [{ id: CP }] };
    });
    await untickCheckpoint(CP);
    expect(calls.some((c) => c.op === "delete" && has(c, "eq", "id", CP))).toBe(true);
  });
});

// ── Types and Save ──────────────────────────────────────────────────────

describe("setMarkTypes", () => {
  const marks = (c: Call): Reply => {
    if (c.op === "select") {
      return { data: [
        { id: MARK, surah_number: 67, word_position: null },
        { id: CP, surah_number: 67, word_position: 3 },
      ] };
    }
    return { data: [{ id: "x" }] };
  };

  it("refuses makhraj on a whole ayah, and an unknown type", async () => {
    as(LISTENER, marks);
    await expect(setMarkTypes(SESSION, [{ markId: MARK, category: "makhraj" }])).rejects.toThrow(/word, not a whole ayah/);
    await expect(setMarkTypes(SESSION, [{ markId: MARK, category: "bogus" as never }])).rejects.toThrow(/Unknown mistake type/);
  });

  it("sets each type, clearing with null", async () => {
    const calls = as(LISTENER, marks);
    await setMarkTypes(SESSION, [{ markId: MARK, category: "hifz" }, { markId: CP, category: null }]);
    const ups = calls.filter((c) => c.op === "update");
    expect(ups.map((u) => u.args[0])).toEqual([{ category: "hifz" }, { category: null }]);
    expect(ups.every((u) => has(u, "eq", "session_id", SESSION))).toBe(true);
  });

  it("refuses a mark from another session", async () => {
    as(LISTENER, marks);
    await expect(setMarkTypes(SESSION, [{ markId: TEACHER, category: "hifz" }])).rejects.toThrow(/not in this session/);
  });
});

describe("submitSession", () => {
  it("saves through murajaah_submit with the trimmed note and revalidates both sides", async () => {
    const calls = as(LISTENER, () => ({ data: "2026-11-10T18:46:00Z" }));
    await submitSession(SESSION, "  Strong  ");
    expect(calls[0]).toMatchObject({ table: "murajaah_submit", args: [{ p_session: SESSION, p_note: "Strong" }] });
    await submitSession(SESSION, "   ");
    expect(calls[1].args[0]).toEqual({ p_session: SESSION, p_note: null });
    expect(revalidatePath).toHaveBeenCalledWith("/hifdh");
    expect(revalidatePath).toHaveBeenCalledWith("/teacher/hifdh");
  });
});

// ── Targets ─────────────────────────────────────────────────────────────

describe("saveTargets", () => {
  const MOHAMED = { id: TEACHER, role: "teacher", section: "ustadhs", class_id: null };
  const ownClass = (c: Call): Reply => (c.table === "classes" ? { data: { id: CLASS } } : {});

  it("is for the class's teacher only", async () => {
    as(LISTENER, ownClass);
    await expect(saveTargets(CLASS, DEFAULT_CLASS_TARGET, [])).rejects.toThrow(/teacher/);
    as({ ...MOHAMED, section: "brothers" }, ownClass);
    await expect(saveTargets(CLASS, DEFAULT_CLASS_TARGET, [])).rejects.toThrow(/teacher/);
    const calls = as(MOHAMED, () => ({ data: null }));
    await expect(saveTargets(CLASS, DEFAULT_CLASS_TARGET, [])).rejects.toThrow("Not your class.");
    expect(has(calls[0], "eq", "teacher_id", TEACHER)).toBe(true);
  });

  it("validates before writing", async () => {
    as(MOHAMED, ownClass);
    await expect(saveTargets(CLASS, { ...DEFAULT_CLASS_TARGET, minutes: { ideal: 20, good: 15, acceptable: 10 } }, []))
      .rejects.toThrow(/in order/);
    await expect(saveTargets(CLASS, DEFAULT_CLASS_TARGET, [{ studentId: "bad", hizb: 1, juz: null, surah10: null }]))
      .rejects.toThrow("Unknown student.");
    expect(supabaseServer).not.toHaveBeenCalled();
  });

  it("writes the class row, drops cleared overrides and upserts the rest", async () => {
    const calls = as(MOHAMED, ownClass);
    await saveTargets(CLASS, { minutes: { ideal: 12, good: 16, acceptable: 22 }, limits: { hizb: 2, juz: 4, surah10: 3 } }, [
      { studentId: RECITER, hizb: null, juz: 6, surah10: null, note: " new to juz " },
      { studentId: ME, hizb: null, juz: null, surah10: null, note: "" },
    ]);
    const t = calls.find((c) => c.table === "murajaah_targets")!;
    expect(t.op).toBe("upsert");
    expect(t.args[0]).toMatchObject({
      class_id: CLASS, ideal_min: 12, good_min: 16, acceptable_min: 22,
      limit_hizb: 2, limit_juz: 4, limit_surah10: 3, updated_by: TEACHER,
    });
    const del = calls.find((c) => c.table === "murajaah_target_overrides" && c.op === "delete")!;
    expect(has(del, "eq", "class_id", CLASS) && has(del, "not", "student_id", "in", `(${RECITER})`)).toBe(true);
    const up = calls.find((c) => c.table === "murajaah_target_overrides" && c.op === "upsert")!;
    expect(up.args[0]).toEqual([{
      student_id: RECITER, class_id: CLASS, limit_hizb: null, limit_juz: 6, limit_surah10: null,
      note: "new to juz", updated_by: TEACHER, updated_at: expect.any(String),
    }]);
    expect(revalidatePath).toHaveBeenCalledWith("/teacher/hifdh");
  });
});
