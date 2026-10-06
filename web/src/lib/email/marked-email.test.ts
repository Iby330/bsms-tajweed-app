import { describe, expect, it } from "vitest";
import {
  answerText, homeworkLink, teacherTitle, markedHtml, markedSubject, markedText, scoreOf, type MarkedHomework,
} from "./marked-email";

const mcq = {
  id: "q1", qtype: "mcq", prompt: "Which letter is from the throat?", points: 2,
  is_bonus: false, is_task: false,
  options: [
    { position: 0, label: "ب", value: "ب", correct: false },
    { position: 1, label: "ح", value: "ح", correct: true },
  ],
};
const text = { id: "q2", qtype: "text", prompt: "Define ghunna.", points: 3, is_bonus: false, is_task: false, options: null };
const task = { id: "q3", qtype: "text", prompt: "Recite Al-Fātiḥa.", points: 0, is_bonus: false, is_task: true, options: null };
const bonus = { id: "q4", qtype: "text", prompt: "Bonus: name a madd.", points: 1, is_bonus: true, is_task: false, options: null };

const hw = (o: Partial<MarkedHomework> = {}): MarkedHomework => ({
  firstName: "Maryam",
  homeworkNumber: 3,
  homeworkTitle: "Ghunna",
  teacher: { fullName: "Wala Mussa", section: "sisters" },
  graded: true,
  pct: 60,
  redo: false,
  questions: [mcq, text, task, bonus],
  answers: [
    { question_id: "q1", response: { selected: [0] }, final_marks: 0, teacher_comment: "Ḥā is the throat letter." },
    { question_id: "q2", response: { text: "A nasal sound <held>" }, final_marks: 3, teacher_comment: null },
    { question_id: "q3", response: { voice: "a/b.webm" }, final_marks: 0, teacher_comment: null },
    { question_id: "q4", response: { text: "" }, final_marks: 0, teacher_comment: "  " },
  ],
  ...o,
});

describe("answerText", () => {
  it("reads a chosen option as the student saw it", () => {
    expect(answerText(mcq, { selected: [1] })).toBe("ح");
  });
  it("is null for nothing chosen or written", () => {
    expect(answerText(mcq, { selected: [] })).toBeNull();
    expect(answerText(text, { text: "  " })).toBeNull();
    expect(answerText(text, undefined)).toBeNull();
  });
  it("says a task is a recording rather than printing its storage path", () => {
    expect(answerText(task, { voice: "a/b.webm" })).toMatch(/recording/i);
  });
});

describe("teacherTitle", () => {
  it("is Ustadha for the sisters and Ustadh for the brothers, with the first name", () => {
    expect(teacherTitle({ fullName: "Wala Mussa", section: "sisters" })).toBe("Ustadha Wala");
    expect(teacherTitle({ fullName: "Daniyal Thakur", section: "brothers" })).toBe("Ustadh Daniyal");
  });
  it("falls back to no title rather than guess", () => {
    expect(teacherTitle({ fullName: "Wala Mussa", section: null })).toBeNull();
    expect(teacherTitle({ fullName: " ", section: "sisters" })).toBeNull();
    expect(teacherTitle(null)).toBeNull();
  });
});

describe("the marked email", () => {
  it("names the teacher by title", () => {
    expect(markedText(hw())).toContain("Ustadha Wala has marked Homework 3, Ghunna.");
    expect(markedText(hw({ teacher: null }))).toContain("Your teacher has marked Homework 3");
  });

  it("scores like the student's paper: every mark over the non-bonus points", () => {
    expect(scoreOf(hw())).toEqual({ marks: 3, outOf: 5 });
  });

  it("puts the score in the subject, or the redo when it was sent back", () => {
    expect(markedSubject(hw())).toBe("Homework 3 is marked: 3/5");
    expect(markedSubject(hw({ redo: true, pct: 40 }))).toBe("Homework 3 is marked: please redo it");
    expect(markedSubject(hw({ graded: false }))).toBe("Homework 3 is marked");
  });

  it("shows each answer, its verdict and the teacher's comment", () => {
    const t = markedText(hw());
    expect(t).toContain("Question 1: Wrong (0/2)");
    expect(t).toContain("Your answer: ب");
    expect(t).toContain("From your teacher: Ḥā is the throat letter.");
    expect(t).toContain("Question 2: Right (3/3)");
    expect(t).toContain("Question 3: Practical task");
    expect(t).toContain("Question 4 (bonus)");
    expect(t).toContain("No answer given");
    expect(t).toContain(homeworkLink(3));
  });

  it("never prints the answer key", () => {
    // ح is the right option and the student did not pick it.
    expect(markedText(hw())).not.toContain("ح\n");
    expect(markedHtml(hw())).not.toMatch(/>ح</);
  });

  it("escapes what students and teachers typed", () => {
    const h = markedHtml(hw());
    expect(h).toContain("A nasal sound &lt;held&gt;");
    expect(h).not.toContain("<held>");
  });

  it("drops a whitespace-only comment", () => {
    expect(markedText(hw())).not.toMatch(/From your teacher:\s*\n/);
  });

  it("tells a student under the pass mark to redo it, and links there", () => {
    const h = hw({ redo: true, pct: 40 });
    expect(markedText(h)).toContain("sent back for you to do again");
    expect(markedHtml(h)).toContain("Redo Homework 3");
  });

  it("has no em dashes", () => {
    expect(markedText(hw())).not.toContain("—");
    expect(markedHtml(hw({ redo: true }))).not.toContain("—");
  });
});
