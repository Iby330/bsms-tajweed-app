// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { HomeworkEntry } from "@/lib/curriculum/tree";
import { MarkedHomework } from "./marked-homework";
import type { ScoredHomework } from "@/lib/homework/sort";

const hw = (termId: number, week: number, pct: number | null): ScoredHomework => ({
  entry: {
    termId,
    series: "tajweed",
    courseLabel: "Tajweed",
    weekNumber: week,
    title: "",
    unlocked: true,
    submission: "approved",
    homework: {
      id: `t${termId}w${week}`,
      week_id: `t${termId}w${week}`,
      number: termId * 100 + week,
      series: "tajweed",
      title: "",
      total_marks: 10,
      due_at: null,
      is_graded: true,
    },
  } satisfies HomeworkEntry,
  pct,
});

const rows = [hw(3, 3, 57), hw(3, 2, 100), hw(3, 1, 70), hw(1, 2, 55), hw(1, 1, 82)];

const select = (c: HTMLElement) => c.querySelector("select")!;
const choose = (c: HTMLElement, v: string) =>
  fireEvent.change(select(c), { target: { value: v } });
/**
 * Percentages in render order, so ordering is asserted on what is shown.
 * Reads the score badge rather than regexing the row: textContent runs the
 * homework number straight into the mark, so "302" + "100%" scans as "2100%".
 */
const pcts = (c: HTMLElement) =>
  [...c.querySelectorAll("li")]
    .map((li) => [...li.querySelectorAll("span")].find((s) => /^\d+%$/.test(s.textContent ?? ""))?.textContent)
    .filter(Boolean);

// No `globals` in this config, so testing-library registers no afterEach of its
// own and these roots stay mounted for the rest of the run. React then wakes a
// scheduler callback after the jsdom environment has gone — "window is not
// defined", reported against this file, intermittently and unrelated to what it
// asserts.
afterEach(cleanup);

describe("MarkedHomework", () => {
  it("offers the four orderings, latest first", () => {
    const { container } = render(<MarkedHomework rows={rows} />);
    expect([...select(container).options].map((o) => o.value)).toEqual([
      "latest",
      "oldest",
      "highest",
      "lowest",
    ]);
    expect(select(container).value).toBe("latest");
  });

  it("reorders the rows on selection", () => {
    const { container } = render(<MarkedHomework rows={rows} />);
    const latest = pcts(container);

    choose(container, "highest");
    const highest = pcts(container);
    expect(highest).not.toEqual(latest);
    // within Term 3, best mark first
    expect(highest.slice(0, 3)).toEqual(["100%", "70%", "57%"]);

    choose(container, "lowest");
    expect(pcts(container).slice(0, 3)).toEqual(["57%", "70%", "100%"]);
  });

  it("never hides a row, whatever the ordering", () => {
    const { container } = render(<MarkedHomework rows={rows} />);
    const count = container.querySelectorAll("li").length;
    expect(count).toBe(rows.length);
    for (const s of ["oldest", "highest", "lowest", "latest"]) {
      choose(container, s);
      expect(container.querySelectorAll("li")).toHaveLength(count);
    }
  });

  it("keeps terms grouped rather than one flat table", () => {
    const { container } = render(<MarkedHomework rows={rows} />);
    const headings = [...container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings.some((t) => t?.includes("Term 3"))).toBe(true);
    expect(headings.some((t) => t?.includes("Term 1"))).toBe(true);

    choose(container, "highest");
    // Term 1's 82 does not jump above Term 3's 57 — terms stay separate.
    const stillGrouped = [...container.querySelectorAll("h3")].map((h) => h.textContent);
    expect(stillGrouped).toEqual(headings);
  });

  it("labels the control and announces the change", () => {
    const { container } = render(<MarkedHomework rows={rows} />);
    const label = container.querySelector(`label[for="${select(container).id}"]`);
    expect(label?.textContent).toBe("Sort");

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("most recent first");
    choose(container, "lowest");
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain(
      "lowest score first",
    );
  });
});
