import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BankQuestion, Paper, Section } from "@/lib/exam-builder/types";
import { BankQuestionCard, lacksAnswer } from "./bank-question-card";
import { PaperCanvas } from "./paper-canvas";
import type { Item, PaperOps } from "./paper-state";
import { moveItemToSectionLocal, removeItemLocal } from "./paper-state";

const html = (el: React.ReactElement) => {
  const div = document.createElement("div");
  div.innerHTML = renderToStaticMarkup(el);
  return div;
};

const q = (over: Partial<BankQuestion> = {}): BankQuestion => ({
  id: "q1", topic_id: "noon.idghaam", kind: "mcq", prompt: "Which has idghaam?", prompt_images: [], prompt_quran: null,
  options: [{ text: "A", image: null, correct: false }, { text: "B", image: null, correct: true }],
  select_many: false, answer: null, marks: 2, sources: [{ label: "EOT2 25/26", kind: "exam", number: "A3" }],
  used_in: ["EOT2 25/26"], review_status: "check", review_note: "picture pairing guessed", archived: false,
  import_key: null, created_by: null, created_at: "2026-11-19T00:00:00Z", imageUrls: {}, ...over,
});

describe("BankQuestionCard", () => {
  it("shows marks, used-in, needs checking and Add", () => {
    const el = html(<BankQuestionCard q={q()} onAdd={() => {}} addLabel="Add to Section A" topicLabel="Aḥkām › Idghaam" />);
    const text = el.textContent!;
    expect(text).toContain("2 marks");
    expect(text).toContain("EOT2 25/26");
    expect(text).toContain("Needs checking");
    expect(text).toContain("Found in EOT2 25/26 (A3)");
    expect(text).toContain("Add to Section A");
    expect(text).toContain("Aḥkām › Idghaam");
    expect(text).not.toContain("No answer yet"); // a correct option counts as an answer
  });

  it("says when there are no marks, no answer, and it is unused; and reads On the paper", () => {
    const el = html(
      <BankQuestionCard q={q({ kind: "short", options: null, marks: null, used_in: [], review_status: "clean" })}
        added onAdd={() => {}} />,
    );
    const text = el.textContent!;
    expect(text).toContain("No marks set");
    expect(text).toContain("No answer yet");
    expect(text).toContain("Not used before");
    expect(text).toContain("On the paper");
    expect(text).not.toContain("Add to paper");
  });

  it("is read-only without onAdd", () => {
    expect(html(<BankQuestionCard q={q()} />).textContent).not.toContain("Add to paper");
    expect(lacksAnswer({ answer: " ", kind: "short", options: null })).toBe(true);
  });
});

const paper: Paper = {
  id: "p", owner_id: "o", title: "End Of Term 1 Exam", date_label: "November 2026", duration_label: "90 mins",
  code: "EOT1", season: "26/27", notes: ["Read carefully."], status: "draft", finalised_at: null,
  created_at: "", updated_at: "",
};
const sections: Section[] = [
  { id: "a", paper_id: "p", position: 1, title: "Section A", kind: "questions", practical: null },
  { id: "b", paper_id: "p", position: 2, title: "Section B", kind: "questions", practical: null },
  { id: "c", paper_id: "p", position: 3, title: "Section C", kind: "practical", practical: { rows: 3, marks: 9, columns: ["Verse"] } },
];
const item = (id: string, section_id: string, position: number, marks: number): Item => ({
  id, paper_id: "p", section_id, position, marks, bank_question_id: null, kind: "short", prompt: `Q ${id}`,
  prompt_images: [], prompt_quran: null, options: null, select_many: false, answer: null, answer_lines: 2, imageUrls: {},
});
const noop = () => {};
const ops: PaperOps = {
  editHeader: noop, renameSection: noop, updatePractical: noop, moveSection: noop, removeSection: noop, addSection: noop,
  openAdd: noop, editItem: noop, moveItem: noop, moveItemToSection: noop, removeItem: noop,
};

describe("PaperCanvas numbering", () => {
  it("restarts numbers in each section and totals every section", () => {
    const items = [item("x", "a", 2, 1), item("y", "a", 1, 2), item("z", "b", 1, 1.5)];
    const el = html(<PaperCanvas paper={paper} sections={sections} items={items} ops={ops} locked={false} showAnswers={false} flashId={null} />);
    const nums = [...el.querySelectorAll("li[id^=item-]")].map((li) => `${li.id}:${li.textContent!.match(/^(\d+)\./)?.[1]}`);
    expect(nums).toEqual(["item-y:1", "item-x:2", "item-z:1"]);
    expect(el.querySelector("[data-testid=paper-total]")!.textContent).toBe("13.5");
    expect(el.textContent).toContain("(3 marks)");
    expect(el.textContent).toContain("(1.5 marks)");
  });

  it("closes up positions when an item moves or goes", () => {
    const s = { paper, sections, items: [item("x", "a", 1, 1), item("y", "a", 2, 1), item("z", "b", 1, 1)] };
    const moved = moveItemToSectionLocal(s, "x", "b");
    expect(moved.items.map((i) => `${i.id}${i.section_id}${i.position}`).sort()).toEqual(["xb2", "ya1", "zb1"]);
    expect(removeItemLocal(moved, "z").items.map((i) => `${i.id}${i.position}`).sort()).toEqual(["x1", "y1"]);
  });
});
