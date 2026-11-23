// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { freshView, type DrawerView } from "@/lib/exam-builder/drawer";
import type { BankQuestion, QuestionKind, Section, Topic } from "@/lib/exam-builder/types";
import { AddDrawer } from "./add-drawer";

afterEach(cleanup);

const topics: Topic[] = [
  { id: "sifaat", parent_id: null, title: "Sifaat", position: 40 },
  { id: "sifaat.ra", parent_id: "sifaat", title: "Ra", position: 43 },
  { id: "sifaat.qalqala", parent_id: "sifaat", title: "Qalqala", position: 44 },
  { id: "sifaat.hams", parent_id: "sifaat", title: "Hams", position: 45 },
  { id: "seerah", parent_id: null, title: "Seerah", position: 90 },
  { id: "matn", parent_id: null, title: "Matn", position: 100 },
];
const q = (id: string, topic_id: string, kind: QuestionKind, prompt: string): BankQuestion => ({
  id, topic_id, kind, prompt, prompt_images: [], prompt_quran: null,
  options: kind === "mcq" ? [{ text: "A", image: null, correct: true }, { text: "B", image: null, correct: false }] : null,
  select_many: false, answer: null, marks: 1, sources: [], used_in: [], review_status: "clean", review_note: null,
  archived: false, import_key: null, created_by: null, created_at: "", imageUrls: {},
});
const questions = [
  q("r1", "sifaat.ra", "mcq", "When is Ra heavy?"),
  q("r2", "sifaat.ra", "short", "Explain Ra tafkheem."),
  q("q1", "sifaat.qalqala", "mcq", "Which letters have qalqala?"),
  q("s1", "seerah", "mcq", "Where was the Prophet born?"),
];
const section: Section = { id: "a", paper_id: "p", position: 1, title: "Section A - Multiple Choice Questions", kind: "questions", practical: null };

function Harness({ onAdd = () => {}, start = freshView("mcq") }: { onAdd?: (q: BankQuestion) => void; start?: DrawerView }) {
  const [view, setView] = useState(start);
  return (
    <AddDrawer
      section={section} view={view} onView={(p) => setView((v) => ({ ...v, ...p }))} guess="mcq"
      resumed={false} added={0} topics={topics} questions={questions} onPaper={new Set(["q1"])}
      paperMarks={9} locked={false} onAdd={onAdd} onWriteNew={() => {}} onAddBlank={() => {}} onClose={() => {}}
    />
  );
}

const drawer = () => document.querySelector<HTMLElement>("aside.exam-add")!;
const row = (name: RegExp) => within(drawer()).getByRole("button", { name });

describe("AddDrawer", () => {
  it("steps series › rule › questions, counting the section's type", () => {
    const add = vi.fn();
    render(<Harness onAdd={add} />);
    expect(row(/^Sifaat/).textContent).toContain("2 multiple choice");
    // A subject with nothing of the type is shown, greyed, not hidden.
    expect((row(/^Matn/) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(row(/^Sifaat/));
    expect((row(/^Hams/) as HTMLButtonElement).disabled).toBe(true);
    expect(row(/^Qalqala/).textContent).toContain("1 on paper");

    fireEvent.click(row(/^Ra/));
    expect(screen.getByText("When is Ra heavy?")).toBeTruthy();
    expect(screen.queryByText("Explain Ra tafkheem.")).toBeNull(); // short answer, filtered out
    fireEvent.click(row(/^Add to Section A/));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));

    fireEvent.click(row(/^Next rule: Qalqala/));
    expect(screen.getByText("Which letters have qalqala?")).toBeTruthy();
    expect(within(drawer()).getByText("On the paper")).toBeTruthy();
  });

  it("goes straight from a one-level series to its questions", () => {
    render(<Harness />);
    fireEvent.click(row(/^Seerah/));
    expect(screen.getByText("Where was the Prophet born?")).toBeTruthy();
    // The trail skips the rule step for it.
    expect(within(drawer()).getByRole("navigation", { name: "Where you are" }).textContent).toBe("All series›Seerah");
  });

  it("shows all types on request, and search lists matches from the whole bank", () => {
    render(<Harness />);
    fireEvent.click(row(/^Show all types/));
    expect(row(/^Sifaat/).textContent).toContain("3 questions");
    fireEvent.change(within(drawer()).getByRole("searchbox"), { target: { value: "ra" } });
    expect(screen.getByText(/2 questions match across the bank/)).toBeTruthy();
    expect(screen.getByText("Explain Ra tafkheem.")).toBeTruthy();
    expect(within(drawer()).getAllByText("Sifaat › Ra").length).toBe(2);
  });
});
