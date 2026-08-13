// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { ClassProgress } from "./class-progress";
import type { ClassRow } from "@/lib/teacher/class-progress";
import type { PaceStatus } from "@/lib/hifz/pace";

const row = (
  name: string,
  pace: PaceStatus | null,
  hwAvg: number | null,
  hifz: { hifzAvg: number | null; surah: ClassRow["surah"]; expectedIndex: number | null } = {
    hifzAvg: 30.2,
    surah: { nameEn: "Al-Balad", nameAr: "البلد", index: 13 },
    expectedIndex: 16,
  },
): ClassRow => ({
  // No spaces: this lands in a URL, and the assertion below reads it back raw.
  studentId: name.split(" ")[0].toLowerCase(),
  name,
  outOf: 43,
  pace,
  hwAvg,
  ...hifz,
});

const rows: ClassRow[] = [
  row("Aisha Khan", "ok", 87.4),
  row("Bilal Rahman", "warn", 72.1),
  row("Yusuf Ahmed", "danger", 64.8),
];

/** Each row's full text, in render order. Assertions use `toContain`, so this
 *  stays honest without depending on how the spans happen to be spaced. */
const rowTexts = (c: HTMLElement) =>
  [...c.querySelectorAll("li")].map((li) => li.textContent ?? "");
const chooseSort = (c: HTMLElement, value: string) =>
  fireEvent.change(c.querySelector("select")!, { target: { value } });

// vitest.config.ts sets neither `globals` nor a setup file, so
// @testing-library's automatic cleanup never registers. Without this, the
// components stay mounted past the end of the file and React flushes
// scheduled work into a torn-down jsdom: "window is not defined".
afterEach(cleanup);

describe("ClassProgress", () => {
  it("defaults to needs-attention, so the student behind is first", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(rowTexts(container)[0]).toContain("Yusuf Ahmed");
  });

  it("reorders when the teacher picks a different sort", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    chooseSort(container, "name");
    expect(rowTexts(container)[0]).toContain("Aisha Khan");
  });

  it("shows both averages, the surah in hand, and where it sits in the 43", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(container.textContent).toContain("87.4%");
    expect(container.textContent).toContain("30.2%");
    expect(container.textContent).toContain("Al-Balad");
    expect(container.textContent).toContain("13 of 43");
  });

  it("says where the calendar expects the student to be", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(rowTexts(container)[0]).toContain("should be on 16");
  });

  it("renders a dash rather than a zero for missing data", () => {
    const { container } = render(
      <ClassProgress
        rows={[row("Musa Ali", null, null, { hifzAvg: null, surah: null, expectedIndex: null })]}
        termId={2}
      />,
    );
    expect(container.textContent).toContain("no target");
    expect(container.textContent).not.toContain("0.0%");
    // No target means no calendar position to miss — the row must not claim one.
    // Scoped to the row: the footnote below the table explains the phrase.
    expect(rowTexts(container)[0]).not.toContain("should be on");
  });

  it("calls a finished run complete rather than showing it as missing data", () => {
    const { container } = render(
      <ClassProgress
        rows={[row("Musa Ali", "ok", 80, { hifzAvg: 100, surah: null, expectedIndex: 43 })]}
        termId={2}
      />,
    );
    expect(container.textContent).toContain("Target complete");
  });

  it("labels each pace status the same way the hifz register does", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    expect(container.textContent).toContain("ahead");
    expect(container.textContent).toContain("on pace");
    expect(container.textContent).toContain("behind");
  });

  it("links each student to their hifz detail page", () => {
    const { container } = render(<ClassProgress rows={rows} termId={2} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/teacher/hifz/aisha");
  });

  it("says so when the class is empty instead of rendering a bare list", () => {
    const { container } = render(<ClassProgress rows={[]} termId={2} />);
    expect(container.textContent).toContain("No students in this class yet");
    expect(container.querySelector("select")).toBeNull();
  });

  it("names the term the homework average covers", () => {
    const { container } = render(<ClassProgress rows={rows} termId={3} />);
    expect(container.textContent).toContain("Term 3");
  });
});
