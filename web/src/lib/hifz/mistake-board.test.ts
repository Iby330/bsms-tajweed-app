import { describe, it, expect } from "vitest";
import {
  MAKHRAJ_LETTERS, ayahsToDrill, boardSessions, bySession, bySurah, hifdhSplit, makhrajByLetter,
  parseSource, pickSource, tajweedByRule,
  type Board, type BoardMark, type BoardSession, type SessionRow,
} from "./mistake-board";

const mark = (over: Partial<BoardMark>): BoardMark => ({
  id: "m", session_id: "s1", surah_number: 88, ayah_number: 17, word_position: 4,
  category: "hifz", detail: "forgot", note: null, created_at: "2026-09-10T10:00:00Z",
  source: "teacher", ...over,
});
const session = (id: string, source: BoardSession["source"], at: string): BoardSession => ({ id, source, at });

describe("parseSource", () => {
  it("reads teacher and partner, and anything else is all", () => {
    expect(parseSource("teacher")).toBe("teacher");
    expect(parseSource("partner")).toBe("partner");
    expect(parseSource(undefined)).toBe("all");
    expect(parseSource("nonsense")).toBe("all");
  });
});

describe("pickSource", () => {
  const board: Board = {
    sessions: [session("t", "teacher", "2026-09-01T00:00:00Z"), session("p", "partner", "2026-09-02T00:00:00Z")],
    marks: [mark({ id: "a", session_id: "t" }), mark({ id: "b", session_id: "p", source: "partner" })],
  };
  it("keeps everything on all", () => {
    expect(pickSource(board, "all")).toBe(board);
  });
  it("filters sessions and marks together", () => {
    const out = pickSource(board, "partner");
    expect(out.sessions.map((s) => s.id)).toEqual(["p"]);
    expect(out.marks.map((m) => m.id)).toEqual(["b"]);
  });
});

describe("hifdhSplit", () => {
  it("counts each slip in taxonomy order and drops empty slices", () => {
    const out = hifdhSplit([
      mark({ id: "1", detail: "swapped" }), mark({ id: "2" }), mark({ id: "3" }),
      mark({ id: "4", category: "tajweed", detail: "madd" }),
    ]);
    expect(out.total).toBe(3);
    expect(out.slices).toEqual([
      { id: "forgot", label: "Forgot it", count: 2 },
      { id: "swapped", label: "Swapped / wrong", count: 1 },
    ]);
  });
  it("keeps a hifdh mark with no detail as its own slice", () => {
    expect(hifdhSplit([mark({ detail: null })]).slices).toEqual([{ id: null, label: "Not specified", count: 1 }]);
  });
});

describe("tajweedByRule", () => {
  it("lists every rule in taxonomy order, unused ones at zero", () => {
    const out = tajweedByRule([
      mark({ id: "1", category: "tajweed", detail: "qalqalah" }),
      mark({ id: "2", category: "tajweed", detail: "qalqalah" }),
      mark({ id: "3", category: "tajweed", detail: "ikhfa" }),
    ]);
    expect(out.total).toBe(3);
    expect(out.rules.map((r) => [r.id, r.count])).toEqual([
      ["ikhfa", 1], ["idgham", 0], ["iqlab", 0], ["izhar", 0],
      ["qalqalah", 2], ["madd", 0], ["ghunnah", 0], ["tafkhim", 0],
    ]);
    expect(out.rules.find((r) => r.id === "tafkhim")!.label).toBe("Heavy / light");
  });
});

describe("makhrajByLetter", () => {
  it("counts by letter and leaves the 28 letters in place", () => {
    const out = makhrajByLetter([
      mark({ id: "1", category: "makhraj", detail: "ق" }),
      mark({ id: "2", category: "makhraj", detail: "ق" }),
      mark({ id: "3", category: "makhraj", detail: "ض" }),
    ]);
    expect(out.total).toBe(3);
    expect(out.counts).toEqual({ "ق": 2, "ض": 1 });
    expect(out.letters).toEqual(MAKHRAJ_LETTERS);
  });
  it("appends a marked letter that is not one of the 28", () => {
    const out = makhrajByLetter([mark({ category: "makhraj", detail: "ء" })]);
    expect(out.letters).toEqual([...MAKHRAJ_LETTERS, "ء"]);
  });
});

describe("bySession", () => {
  const sessions = Array.from({ length: 14 }, (_, i) =>
    session(`s${i}`, i % 2 ? "partner" : "teacher", `2026-08-${String(i + 1).padStart(2, "0")}T10:00:00Z`));
  it("keeps the last twelve, oldest first, clean ones at zero", () => {
    const board: Board = {
      sessions: [...sessions].reverse(),
      marks: [
        mark({ id: "a", session_id: "s13" }),
        mark({ id: "b", session_id: "s13", category: "tajweed", detail: "madd" }),
        mark({ id: "c", session_id: "s0" }),
      ],
    };
    const cols = bySession(board);
    expect(cols).toHaveLength(12);
    expect(cols[0].id).toBe("s2");
    expect(cols[11]).toMatchObject({ id: "s13", source: "partner", hifz: 1, tajweed: 1, makhraj: 0, total: 2 });
    expect(cols[5].total).toBe(0);
  });
});

describe("bySurah", () => {
  it("ranks surahs by mistakes, ties in run order from An-Nas", () => {
    const out = bySurah([
      mark({ id: "1", surah_number: 87 }), mark({ id: "2", surah_number: 88 }),
      mark({ id: "3", surah_number: 88 }), mark({ id: "4", surah_number: 96 }),
    ]);
    expect(out).toEqual([
      { surah: 88, count: 2 }, { surah: 96, count: 1 }, { surah: 87, count: 1 },
    ]);
  });
});

describe("ayahsToDrill", () => {
  const marks = [
    mark({ id: "1", session_id: "t1" }),
    mark({ id: "2", session_id: "p1", source: "partner" }),
    mark({ id: "3", session_id: "p2", source: "partner" }),
    mark({ id: "4", session_id: "t1", word_position: 2, category: "tajweed", detail: "madd" }),
    mark({ id: "5", session_id: "t1", surah_number: 87, ayah_number: 6, word_position: null, detail: "forgot" }),
  ];
  it("ranks ayahs by mistakes and says what went wrong and who said it", () => {
    const out = ayahsToDrill(marks);
    expect(out.map((a) => `${a.surah}:${a.ayah}`)).toEqual(["88:17", "87:6"]);
    const top = out[0];
    expect(top.count).toBe(4);
    expect(top.chips).toEqual([
      { category: "hifz", detail: "forgot", label: "Forgot it", teacher: 1, partner: 2 },
      { category: "tajweed", detail: "madd", label: "Madd length", teacher: 1, partner: 0 },
    ]);
    expect(top.words).toEqual({ 4: "hifz", 2: "tajweed" });
    expect(top.wholeAyah).toBe(false);
    expect(top.sessionIds.sort()).toEqual(["p1", "p2", "t1"]);
  });
  it("marks a whole-ayah slip", () => {
    const whole = ayahsToDrill(marks).find((a) => a.surah === 87)!;
    expect(whole.wholeAyah).toBe(true);
    expect(whole.words).toEqual({});
  });
  it("names a makhraj chip by its letter", () => {
    const out = ayahsToDrill([mark({ category: "makhraj", detail: "ق" })]);
    expect(out[0].chips[0].label).toBe("Makhraj of ق");
  });
});

describe("boardSessions", () => {
  const row = (over: Partial<SessionRow> & { id: string }): SessionRow => ({
    kind: "hearing", submitted_at: "2026-10-01T09:00:00Z", reviewer_id: "t1", counts_as_result: true, ...over,
  });

  it("a day of marks and its result is one teacher hearing, not two", () => {
    const rows = [
      row({ id: "marks", counts_as_result: false }),
      row({ id: "result", submitted_at: "2026-10-01T09:40:00Z" }),
    ];
    expect(boardSessions(rows, new Set(["marks"])).map((s) => s.id)).toEqual(["marks"]);
  });

  it("a result with no marks that day is a clean hearing and stays", () => {
    const rows = [
      row({ id: "marks", counts_as_result: false, submitted_at: "2026-09-30T09:00:00Z" }),
      row({ id: "result" }),
    ];
    expect(boardSessions(rows, new Set(["marks"])).map((s) => s.id)).toEqual(["marks", "result"]);
  });

  it("another teacher's marks that day leave this teacher's clean result in", () => {
    const rows = [row({ id: "marks", counts_as_result: false, reviewer_id: "t2" }), row({ id: "result" })];
    expect(boardSessions(rows, new Set(["marks"])).map((s) => s.id)).toEqual(["marks", "result"]);
  });

  it("an emptied marking session is not a hearing", () => {
    expect(boardSessions([row({ id: "marks", counts_as_result: false })], new Set())).toEqual([]);
  });

  it("a result from before the split holds its own marks and stays; partner sessions always stay", () => {
    const rows = [row({ id: "old" }), row({ id: "p", kind: "peer", reviewer_id: "s2" })];
    expect(boardSessions(rows, new Set(["old"]))).toEqual([
      { id: "old", source: "teacher", at: "2026-10-01T09:00:00Z" },
      { id: "p", source: "partner", at: "2026-10-01T09:00:00Z" },
    ]);
  });
});
