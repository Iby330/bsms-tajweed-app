// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { LeaderboardPanel, type LbScope } from "./leaderboard-panel";

const row = (rank: number, name: string, pct: number) => ({ rank, name, pct });

/** Six in the class, Adam 3rd — enough that the collapsed window hides some. */
const classScope: LbScope = {
  key: "class",
  label: "My class",
  selfName: "Adam Khan",
  noun: "in my class",
  rows: [
    row(1, "Bilal Ahmed", 91),
    row(2, "Yusuf Ali", 88),
    row(3, "Adam Khan", 84),
    row(4, "Omar Farouk", 80),
    row(5, "Zaid Hassan", 77),
    row(6, "Musa Ibrahim", 70),
  ],
};

const cohortScope: LbScope = {
  key: "cohort",
  label: "All brothers",
  selfName: "Adam Khan",
  noun: "all brothers",
  rows: [
    row(1, "Bilal Ahmed", 91),
    row(2, "Ibrahim Noor", 90),
    row(11, "Adam Khan", 84),
    row(12, "Salim Yusuf", 83),
  ],
};

const text = (c: HTMLElement) => c.textContent ?? "";
const buttonBy = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("button")].find((b) => (b.textContent ?? "").includes(label))!;

describe("LeaderboardPanel", () => {
  it("collapses to the window around the student, not the whole table", () => {
    const { container } = render(<LeaderboardPanel title="Homework" scopes={[classScope]} />);
    // above / you / below
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(text(container)).toContain("Adam Khan");
    expect(text(container)).toContain("Yusuf Ali");
    expect(text(container)).toContain("Omar Farouk");
    // outside the window
    expect(text(container)).not.toContain("Musa Ibrahim");
  });

  it("expands to the full table in place", () => {
    const { container } = render(<LeaderboardPanel title="Homework" scopes={[classScope]} />);
    fireEvent.click(buttonBy(container, "See all 6"));
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(text(container)).toContain("Musa Ibrahim");
    expect(text(container)).toContain("Show less");
  });

  it("switches scope and shows that scope's ranks", () => {
    const { container } = render(
      <LeaderboardPanel title="Homework" scopes={[classScope, cohortScope]} />,
    );
    // class scope ranks Adam 3rd
    expect(text(container)).toContain("Adam Khan");
    expect(text(container)).toContain("Omar Farouk");

    fireEvent.click(buttonBy(container, "All brothers"));
    // cohort scope ranks him 11th, among different neighbours
    expect(text(container)).toContain("Salim Yusuf");
    expect(text(container)).toContain("11");
    expect(text(container)).not.toContain("Omar Farouk");
  });

  it("collapses again when the scope changes", () => {
    const { container } = render(
      <LeaderboardPanel title="Homework" scopes={[classScope, cohortScope]} />,
    );
    fireEvent.click(buttonBy(container, "See all 6"));
    expect(container.querySelectorAll("li")).toHaveLength(6);

    fireEvent.click(buttonBy(container, "All brothers"));
    // back to the three-row window rather than 4 rows of the new scope
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(text(container)).toContain("See all 4");
  });

  it("marks the student's own row as pressed state on the active toggle", () => {
    const { container } = render(
      <LeaderboardPanel title="Homework" scopes={[classScope, cohortScope]} />,
    );
    expect(buttonBy(container, "My class").getAttribute("aria-pressed")).toBe("true");
    expect(buttonBy(container, "All brothers").getAttribute("aria-pressed")).toBe("false");
  });

  it("highlights a class row when the rows ARE classes", () => {
    // In the class-vs-class scope "you" is the student's class, not the student.
    const scope: LbScope = {
      key: "classes",
      label: "All classes",
      selfName: "Year 9B",
      noun: "classes",
      rows: [row(1, "Year 9A", 80), row(2, "Year 9B", 74), row(3, "Year 9C", 61)],
    };
    const { container } = render(<LeaderboardPanel title="Hifz" scopes={[scope]} />);
    const self = [...container.querySelectorAll("li")].find((li) =>
      (li.textContent ?? "").includes("Year 9B"),
    )!;
    expect(self.className).toContain("bg-ink");
  });

  it("says so when there is nothing ranked yet", () => {
    const { container } = render(
      <LeaderboardPanel
        title="Hifz"
        scopes={[{ key: "k", label: "l", selfName: "x", noun: "n", rows: [] }]}
      />,
    );
    expect(text(container)).toContain("No rankings yet.");
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("offers no expand affordance when the window already shows everything", () => {
    const scope: LbScope = { ...classScope, rows: classScope.rows.slice(0, 2) };
    const { container } = render(<LeaderboardPanel title="Homework" scopes={[scope]} />);
    expect(text(container)).not.toContain("See all");
  });
});
