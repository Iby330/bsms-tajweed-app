// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HifzRecord, type RecordEntry } from "./hifz-record";

const entry = (n: number, date: string, comment: string | null = null): RecordEntry => ({
  number: n,
  name_en: `S${n}`,
  name_ar: `س${n}`,
  passed_at: date,
  teacher_comment: comment,
});

describe("HifzRecord", () => {
  it("renders nothing with no entries", () => {
    const { container } = render(<HifzRecord entries={[]} />);
    expect(container.innerHTML).toBe("");
  });
  it("shows up to two entries with no disclosure", () => {
    const { container } = render(
      <HifzRecord entries={[entry(113, "2026-09-19", "lovely tajweed"), entry(114, "2026-09-12")]} />,
    );
    expect(container.textContent).toContain("S113");
    expect(container.textContent).toContain("س113");
    expect(container.textContent).toContain("lovely tajweed");
    expect(container.textContent).toContain("passed 19 Sept");
    expect(container.querySelector("details")).toBeNull();
  });
  it("puts entries beyond the first two behind a disclosure", () => {
    const { container } = render(
      <HifzRecord
        entries={[entry(111, "2026-10-03"), entry(112, "2026-09-26"), entry(113, "2026-09-19"), entry(114, "2026-09-12")]}
      />,
    );
    expect(container.textContent).toContain("Show all 4");
    expect(container.querySelectorAll("li")).toHaveLength(4);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details!.textContent).toContain("S113");
    expect(details!.textContent).toContain("S114");
    // the two newest are OUTSIDE the details
    expect(details!.textContent).not.toContain("S111");
  });
});
