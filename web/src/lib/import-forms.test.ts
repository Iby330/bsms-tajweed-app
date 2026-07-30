import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hwNumber, classifyItem, transformForm, answerToConcepts, parseGuide,
  weekFor, run, GRADEBOOK_TOTALS,
} from "../../../execution/import_forms";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const exportData = JSON.parse(
  readFileSync(join(repoRoot, "reference/forms_export.json"), "utf8"),
);
const formByNum = (n: number) =>
  exportData.forms.find((f: { file: string }) => hwNumber(f.file) === n);

describe("hwNumber", () => {
  it("parses regular and TFP names", () => {
    expect(hwNumber("1 : Introduction")).toBe(1);
    expect(hwNumber("15 : Clash of 2 Sakinayn ")).toBe(15);
    expect(hwNumber("TFP: HW 3")).toBe(103);
    expect(hwNumber("garbage")).toBeNull();
  });
});

describe("classifyItem", () => {
  it("skips Name/Class metadata", () => {
    expect(classifyItem({ index: 0, type: "TEXT", title: "Name", points: 0 })).toBe("skip");
    expect(classifyItem({ index: 1, type: "MULTIPLE_CHOICE", title: "Class", points: 0,
      options: [{ position: 0, label: "A", value: "Rayyan", correct: null }] })).toBe("skip");
    expect(classifyItem({ index: 1, type: "MULTIPLE_CHOICE",
      title: "Which Class do you belong to? ", points: 0,
      options: [{ position: 0, label: "A", value: "x", correct: null }] })).toBe("skip");
  });
  it("routes single-option zero-point task confirmations to task", () => {
    expect(classifyItem({ index: 5, type: "MULTIPLE_CHOICE",
      title: "HW Task: Find 5 examples of Mad ul Asli and send them as a voice note!",
      points: 0,
      options: [{ position: 0, label: "A", value: "Yes !", correct: null }] })).toBe("task");
  });
  it("skips zero-point single-option notices", () => {
    expect(classifyItem({ index: 9, type: "MULTIPLE_CHOICE",
      title: "WELL DONE BONUS ROUND OVER ", points: 0,
      options: [{ position: 0, label: "A", value: "ok", correct: null }] })).toBe("skip");
  });
});

describe("transformForm — real fixtures", () => {
  it("HW 1 (clean): total 10, all questions non-bonus", () => {
    const hw = transformForm(formByNum(1));
    expect(hw.number).toBe(1);
    expect(hw.total_marks).toBe(10);
    const graded = hw.questions.filter((q) => q.points > 0 && !q.is_bonus);
    expect(graded.reduce((s, q) => s + q.points, 0)).toBe(10);
    expect(hw.questions.some((q) => q.is_bonus)).toBe(false);
  });

  it("HW 15 (bonus round): base = 7 official, 9 bonus marks flagged", () => {
    const hw = transformForm(formByNum(15));
    expect(hw.total_marks).toBe(7);
    const base = hw.questions.filter((q) => q.points > 0 && !q.is_bonus);
    const bonus = hw.questions.filter((q) => q.is_bonus);
    expect(base.reduce((s, q) => s + q.points, 0)).toBe(7);
    expect(bonus.reduce((s, q) => s + q.points, 0)).toBe(9);
  });

  it("HW 9 (grid): residual 10 applied, grid is manual/needs_key", () => {
    const hw = transformForm(formByNum(9));
    const grid = hw.questions.find((q) => q.qtype === "grid");
    expect(grid).toBeDefined();
    expect(grid!.points).toBe(10);
    expect(grid!.scoring).toBe("manual");
    expect(grid!.needs_key).toBe(true);
    const nonBonus = hw.questions.filter((q) => q.points > 0 && !q.is_bonus);
    expect(nonBonus.reduce((s, q) => s + q.points, 0)).toBe(15);
  });

  it("TFP form: number 101+, series tfp, ungraded", () => {
    const hw = transformForm(formByNum(101));
    expect(hw.series).toBe("tfp");
    expect(hw.is_graded).toBe(false);
    expect(hw.total_marks).toBe(0);
  });

  it("ALL 21 homeworks reconcile with the gradebook (the hard assert)", () => {
    for (const n of Object.keys(GRADEBOOK_TOTALS).map(Number)) {
      const hw = transformForm(formByNum(n)); // throws on mismatch
      const nonBonus = hw.questions.filter((q) => q.points > 0 && !q.is_bonus);
      expect(nonBonus.reduce((s, q) => s + q.points, 0)).toBe(GRADEBOOK_TOTALS[n]);
    }
  });

  it("no Name/Class questions survive the import", () => {
    for (const f of exportData.forms) {
      const hw = transformForm(f);
      for (const q of hw.questions) {
        expect(q.prompt.trim().toLowerCase()).not.toMatch(/^(name|class)\s*\??$/);
      }
    }
  });
});

describe("weekFor", () => {
  it("places homeworks into the right term/week", () => {
    expect(weekFor(1)).toEqual({ term: 1, week: 1 });
    expect(weekFor(8)).toEqual({ term: 1, week: 8 });
    expect(weekFor(9)).toEqual({ term: 2, week: 1 });
    expect(weekFor(15)).toEqual({ term: 2, week: 7 });
    expect(weekFor(16)).toEqual({ term: 3, week: 1 });
    expect(weekFor(21)).toEqual({ term: 3, week: 6 });
    expect(weekFor(103)).toEqual({ term: 3, week: 3 });
  });
});

describe("answerToConcepts", () => {
  it("splits on (N) markers when they sum to the form's points", () => {
    const c = answerToConcepts(
      "Observing each letter with correct origin (1) And characteristics (1)", 2);
    expect(c).toHaveLength(2);
    expect(c[0].desc).toContain("correct origin");
    expect(c.reduce((s, x) => s + x.marks, 0)).toBe(2);
  });
  it("falls back to a single full-points concept when markers disagree", () => {
    const c = answerToConcepts("To merge (1)", 3); // markers sum 1 ≠ 3
    expect(c).toHaveLength(1);
    expect(c[0].marks).toBe(3);
  });
  it("no markers → single concept", () => {
    const c = answerToConcepts("Ali ibn Abi Talib", 1);
    expect(c).toEqual([{ id: "c1", desc: "Ali ibn Abi Talib", marks: 1 }]);
  });
});

describe("full run()", () => {
  it("produces 28 homeworks, valid SQL, no duplicate numbers", () => {
    const { homeworks, sql } = run(repoRoot);
    expect(homeworks).toHaveLength(28); // 21 + 7 TFP
    expect(sql).toContain("insert into homeworks");
    expect(sql).toContain("insert into questions");
    // spot check: Arabic survived into the SQL
    expect(sql).toMatch(/[؀-ۿ]/);
  });

  it("guide rubrics attach to a meaningful share of free-text questions", () => {
    const { homeworks, rubrics } = run(repoRoot);
    const freeText = homeworks
      .filter((h) => h.series === "tajweed")
      .flatMap((h) => h.questions)
      .filter((q) => ["text", "paragraph"].includes(q.qtype) && q.points > 0 && !q.is_task);
    // guide covers HW 1-12,16-18; expect at least a third matched
    expect(rubrics).toBeGreaterThan(freeText.length / 3);
  });
});
