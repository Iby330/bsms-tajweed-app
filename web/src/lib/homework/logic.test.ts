import { describe, it, expect } from "vitest";
import {
  attentionHeading,
  attentionList,
  missingTaskRecordings,
  parseMarkInput,
  pctTone,
  redoNotice,
  responseIsEmpty,
  statusChip,
  voiceOf,
  voiceResponse,
} from "./logic";
import { REDO_THRESHOLD_PCT } from "@/lib/marking/redo";

/**
 * The marking screen types marks into a plain text field, so `min`/`max`/`step`
 * no longer police them — this does.
 */
describe("parseMarkInput", () => {
  it("reads a whole number and a half mark", () => {
    expect(parseMarkInput("3", 5)).toEqual({ value: 3, valid: true });
    expect(parseMarkInput("2.5", 5)).toEqual({ value: 2.5, valid: true });
  });

  it("accepts a leading decimal point", () => {
    expect(parseMarkInput(".5", 5)).toEqual({ value: 0.5, valid: true });
  });

  it("accepts a trailing decimal point mid-typing", () => {
    // "2." is what the field holds for one keystroke on the way to "2.5"
    expect(parseMarkInput("2.", 5)).toEqual({ value: 2, valid: true });
  });

  it("treats blank as not marked yet, not as an error", () => {
    expect(parseMarkInput("", 5)).toEqual({ value: null, valid: true });
    expect(parseMarkInput("   ", 5)).toEqual({ value: null, valid: true });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseMarkInput(" 4 ", 5)).toEqual({ value: 4, valid: true });
  });

  it("accepts both ends of the range", () => {
    expect(parseMarkInput("0", 5)).toEqual({ value: 0, valid: true });
    expect(parseMarkInput("5", 5)).toEqual({ value: 5, valid: true });
  });

  it("flags a mark above the question's points", () => {
    expect(parseMarkInput("9", 5)).toEqual({ value: 9, valid: false });
  });

  it("keeps the too-high number rather than clamping it", () => {
    // the teacher sees what they typed, flagged — nothing is silently rewritten
    expect(parseMarkInput("50", 5).value).toBe(50);
  });

  it("rejects text, and reports no value for it", () => {
    // a sign is not part of a mark, so "-1" is unparseable rather than
    // an out-of-range number
    for (const raw of ["abc", "2a", "1.2.3", "-1", "--1", ".", "1e3", "٢"]) {
      expect(parseMarkInput(raw, 5)).toEqual({ value: null, valid: false });
    }
  });
});

/** One set of bands for every percentage on the homework screens. */
describe("pctTone", () => {
  it("reads 80 and up as well done", () => {
    expect(pctTone(80)).toBe("ok");
    expect(pctTone(100)).toBe("ok");
  });

  it("reads the middle band as worth a look", () => {
    expect(pctTone(50)).toBe("warn");
    expect(pctTone(79.9)).toBe("warn");
  });

  it("reads below half as needing a conversation", () => {
    expect(pctTone(49.9)).toBe("danger");
    expect(pctTone(0)).toBe("danger");
  });
});

/* ── Status chips ─────────────────────────────────────────────────────── */

describe("statusChip", () => {
  it("reads each status the way the student should see it", () => {
    expect(statusChip("draft")).toEqual({ label: "Draft", tone: "warn" });
    expect(statusChip("submitted")).toEqual({ label: "Submitted", tone: "ink" });
    // marking is invisible until the teacher releases it
    expect(statusChip("auto_marked")).toEqual({ label: "Submitted", tone: "ink" });
    expect(statusChip("approved")).toEqual({ label: "Marked", tone: "ok" });
    expect(statusChip(null)).toEqual({ label: "Not started", tone: "muted" });
    expect(statusChip(undefined)).toEqual({ label: "Not started", tone: "muted" });
  });

  it("calls a sent-back draft a redo", () => {
    expect(statusChip("draft", { attempt: 2 })).toEqual({ label: "Redo", tone: "danger" });
    expect(statusChip("draft", { attempt: 7 })).toEqual({ label: "Redo", tone: "danger" });
  });

  it("leaves a first attempt as a plain draft", () => {
    expect(statusChip("draft", null)).toEqual({ label: "Draft", tone: "warn" });
    expect(statusChip("draft", { attempt: 1 })).toEqual({ label: "Draft", tone: "warn" });
  });

  /* A handed-in redo is with the teacher like any other submission — the
   * attempt number is the teacher's business at that point, not the chip's. */
  it("says nothing about the attempt once the redo is handed in", () => {
    expect(statusChip("submitted", { attempt: 2 })).toEqual({ label: "Submitted", tone: "ink" });
    expect(statusChip("approved", { attempt: 3 })).toEqual({ label: "Marked", tone: "ok" });
  });
});

/* ── The home hero's "needs you" box ──────────────────────────────────── */

const entry = (id: string) => ({ homework: { id } });

describe("attentionList", () => {
  it("puts redos first — they were already marked once", () => {
    const items = attentionList([entry("a"), entry("b")], [entry("r")]);
    expect(items).toEqual([
      { kind: "redo", entry: entry("r") },
      { kind: "overdue", entry: entry("a") },
      { kind: "overdue", entry: entry("b") },
    ]);
  });

  /* A redo whose original deadline has passed qualifies as overdue too, and
   * one homework must never take two rows in a box that says "one thing
   * needs you". */
  it("never lists the same homework twice", () => {
    const items = attentionList([entry("a"), entry("r")], [entry("r")]);
    expect(items.map((i) => [i.kind, i.entry.homework.id])).toEqual([
      ["redo", "r"],
      ["overdue", "a"],
    ]);
  });

  it("keeps each list in the order it was given", () => {
    const items = attentionList([entry("a")], [entry("r2"), entry("r1")]);
    expect(items.map((i) => i.entry.homework.id)).toEqual(["r2", "r1", "a"]);
  });

  it("is empty when nothing needs the student", () => {
    expect(attentionList([], [])).toEqual([]);
  });
});

describe("attentionHeading", () => {
  it("names the kind when only one is pending", () => {
    expect(attentionHeading(attentionList([], [entry("r")]))).toBe("Redo");
    expect(attentionHeading(attentionList([entry("a")], []))).toBe("Overdue");
  });

  it("falls back to a heading that covers both", () => {
    expect(attentionHeading(attentionList([entry("a")], [entry("r")]))).toBe("Needs you");
  });

  it("has something to say about an empty list", () => {
    expect(attentionHeading([])).toBe("Needs you");
  });
});

describe("redoNotice", () => {
  it("names the mark that failed and the one to beat", () => {
    expect(redoNotice(45)).toBe("You scored 45% last time and need 60%.");
  });

  it("rounds to a whole percent — nobody scored 44.4444%", () => {
    expect(redoNotice(44.6)).toBe("You scored 45% last time and need 60%.");
    expect(redoNotice(44.4)).toBe("You scored 44% last time and need 60%.");
    expect(redoNotice(0)).toBe("You scored 0% last time and need 60%.");
  });

  it("says only what is needed when the old mark was never recorded", () => {
    expect(redoNotice(null)).toBe("You need 60% to pass this homework.");
  });

  /* The sentence and the rule must not be able to drift apart. */
  it("quotes the threshold the marking rule actually uses", () => {
    expect(redoNotice(45)).toContain(`${REDO_THRESHOLD_PCT}%`);
    expect(redoNotice(null)).toContain(`${REDO_THRESHOLD_PCT}%`);
  });
});

/* ── Recitations ──────────────────────────────────────────────────────── */

describe("voiceResponse / voiceOf", () => {
  it("round-trips the storage path a recording landed at", () => {
    expect(voiceResponse("u1/s1/a1/q1.webm")).toEqual({ voice: "u1/s1/a1/q1.webm" });
    expect(voiceOf(voiceResponse("u1/s1/a1/q1.webm"))).toBe("u1/s1/a1/q1.webm");
  });

  it("reads nothing out of any other shape", () => {
    expect(voiceOf({ text: "hello" })).toBe("");
    expect(voiceOf({ voice: 7 })).toBe("");
    expect(voiceOf(null)).toBe("");
    expect(voiceOf(undefined)).toBe("");
  });
});

describe("responseIsEmpty", () => {
  /* A recitation is the answer to a task question. Counting it blank would
     put every task in the "not attempted" column of the class stats. */
  it("counts a recitation as answered", () => {
    expect(responseIsEmpty(voiceResponse("u1/s1/a1/q1.webm"))).toBe(false);
  });

  it("counts a recitation with no path as blank", () => {
    expect(responseIsEmpty({ voice: "" })).toBe(true);
    expect(responseIsEmpty({ voice: "   " })).toBe(true);
  });

  it("still reads the shapes it always has", () => {
    expect(responseIsEmpty({ selected: [1] })).toBe(false);
    expect(responseIsEmpty({ selected: [] })).toBe(true);
    expect(responseIsEmpty({ text: "a" })).toBe(false);
    expect(responseIsEmpty({ text: " " })).toBe(true);
    expect(responseIsEmpty({ grid: { row: "col" } })).toBe(false);
    expect(responseIsEmpty({ grid: {} })).toBe(true);
    expect(responseIsEmpty(null)).toBe(true);
    expect(responseIsEmpty("nonsense")).toBe(true);
  });
});

/* ── The submit gate ──────────────────────────────────────────────────── */

const task = (id: string) => ({ id, is_task: true });
const written = (id: string) => ({ id, is_task: false });

describe("missingTaskRecordings", () => {
  it("names the tasks with nothing recorded against them", () => {
    const missing = missingTaskRecordings(
      [task("t1"), written("w1"), task("t2")],
      [{ question_id: "t1" }],
    );
    expect(missing.map((q) => q.id)).toEqual(["t2"]);
  });

  it("is empty once every task has a recording", () => {
    expect(missingTaskRecordings([task("t1")], [{ question_id: "t1" }])).toEqual([]);
  });

  /* Typed answers are autosaved and never block a hand-in — only recitations
     are, because a missing one leaves the teacher nothing to listen to. */
  it("never holds a hand-in up over a written question", () => {
    expect(missingTaskRecordings([written("w1"), written("w2")], [])).toEqual([]);
  });

  it("ignores a note against a question that isn't on the paper", () => {
    expect(
      missingTaskRecordings([task("t1")], [{ question_id: "gone" }]).map((q) => q.id),
    ).toEqual(["t1"]);
  });
});
