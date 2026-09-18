// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HifzGrid, type MarkRow } from "./hifz-grid";

/** 43 surahs, An-Nas (114) down to Al-Qalam (68) — the standard run. */
const run = (passedTo: number, over: Partial<MarkRow> & { number?: number } = {}): MarkRow[] =>
  Array.from({ length: 43 }, (_, i) => {
    const base: MarkRow = {
      number: 114 - i,
      name_en: `S${114 - i}`,
      name_ar: `س${114 - i}`,
      passed: i < passedTo,
      heard: false,
      comment: null,
      passedAt: i < passedTo ? "2026-09-19" : null,
    };
    return over.number === base.number ? { ...base, ...over } : base;
  });

const cellFor = (container: HTMLElement, nameEn: string) => {
  const cell = [...container.querySelectorAll("a.cell")].find((a) =>
    a.querySelector(".en")?.textContent?.startsWith(nameEn),
  );
  if (!cell) throw new Error(`no cell for ${nameEn}`);
  return cell as HTMLAnchorElement;
};

afterEach(cleanup);

describe("HifzGrid", () => {
  it("renders nothing without a run", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={[]} expected={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("marks the first unpassed surah as next and the passed ones as done", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(3)} expected={3} />);
    expect(container.querySelectorAll(".cell.done").length).toBe(3);
    expect(cellFor(container, "S111").className).toContain("next");
  });

  it("links every cell to that surah's page for this student", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(0)} expected={0} />);
    expect(cellFor(container, "S114").getAttribute("href")).toBe("/teacher/hifdh/s1/114");
    expect(cellFor(container, "S100").getAttribute("href")).toBe("/teacher/hifdh/s1/100");
  });

  it("flags a cell that carries a comment", () => {
    const rows = run(2, { number: 113, comment: "rushed the ending" });
    const { container } = render(<HifzGrid studentId="s1" rows={rows} expected={2} />);
    expect(cellFor(container, "S113").querySelector(".cmt")).not.toBeNull();
    expect(cellFor(container, "S112").querySelector(".cmt")).toBeNull();
  });

  it("shows the pace rule only when the student is genuinely behind", () => {
    const behind = render(<HifzGrid studentId="s1" rows={run(2)} expected={8} />);
    expect(behind.container.textContent).toContain("Expected here by now");
    cleanup();

    // expected = passed + 1 lands on the surah they are already on: no rule.
    const onIt = render(<HifzGrid studentId="s1" rows={run(8)} expected={9} />);
    expect(onIt.container.textContent).not.toContain("Expected here by now");
    cleanup();

    const done = render(<HifzGrid studentId="s1" rows={run(43)} expected={30} />);
    expect(done.container.textContent).not.toContain("Expected here by now");
    expect(done.container.querySelector(".cell.next")).toBeNull();
  });

  it("says a hizb is ready for the check only when all of it is on the run and passed", () => {
    // The run starts at An-Nas, so its first band is hizb 60 entire (114–78).
    const { container } = render(<HifzGrid studentId="s1" rows={run(43)} expected={43} />);
    expect(container.textContent).toContain("ready for the check");
  });

  // ── heard, not passed: the third state ────────────────────────────────
  it("draws a heard, not-passed surah as redo", () => {
    const rows = run(0, { number: 113, heard: true });
    const { container } = render(<HifzGrid studentId="s1" rows={rows} expected={0} />);
    const cell = cellFor(container, "S113");
    expect(cell.className).toContain("redo");
    expect(cell.textContent).toContain("heard, not passed");
  });

  it("keeps a passed AND heard surah as done, not redo", () => {
    const rows = run(1, { number: 114, heard: true });
    const { container } = render(<HifzGrid studentId="s1" rows={rows} expected={1} />);
    const cell = cellFor(container, "S114");
    expect(cell.className).toContain("done");
    expect(cell.className).not.toContain("redo");
  });
});
