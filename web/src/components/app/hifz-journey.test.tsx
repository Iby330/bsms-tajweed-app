// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HifzJourney } from "./hifz-journey";
import type { Surah } from "@/lib/hifz/pace";

const RUN: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${114 - i}`,
  name_en: `S${114 - i}`,
}));
const recs = (idxs: number[]) =>
  new Map(idxs.map((i) => [RUN[i].number, { passed_at: "2026-09-19", teacher_comment: null }]));

describe("HifzJourney", () => {
  it("omits the marker when it would sit on the current node (expected = passed + 1)", () => {
    const { container } = render(<HifzJourney list={RUN} records={recs([0,1,2,3,4,5,6,7])} expected={9} />);
    // The pace rule is suppressed; the current surah is still marked as next.
    expect(container.textContent).not.toContain("Expected here by now");
    expect(container.querySelector(".cell.next")).not.toBeNull();
  });
  it("renders the marker on the expected surah when genuinely behind", () => {
    const { container } = render(<HifzJourney list={RUN} records={recs([0,1])} expected={8} />);
    expect(container.textContent).toContain("Expected here by now");
    expect(container.textContent).toContain(RUN[7].name_en);
  });
  it("keeps a partially-passed later group expanded with its dates visible", () => {
    const { container } = render(
      <HifzJourney list={RUN} records={recs([0,1,2,28,29,30])} expected={0} />,
    );
    // collapsed label form must NOT appear for hizb 59, and its pass dates must
    // The index shows every surah rather than collapsing runs, so nothing is
    // summarised as "· 9 surahs"; dates now live in each surah's detail.
    expect(container.textContent).not.toContain("· 9 surahs");
    expect(container.querySelectorAll(".cell.done").length).toBeGreaterThan(0);
  });
  it("suppresses the marker once the list is complete", () => {
    const all = recs(Array.from({ length: 43 }, (_, i) => i));
    const { container } = render(<HifzJourney list={RUN} records={all} expected={30} />);
    expect(container.textContent).not.toContain("Expected here by now");
    // Nothing is "next" once every surah on the list is passed.
    expect(container.querySelector(".cell.next")).toBeNull();
  });
  it("renders nothing for an empty list", () => {
    const { container } = render(<HifzJourney list={[]} records={new Map()} expected={0} />);
    expect(container.innerHTML).toBe("");
  });
});
