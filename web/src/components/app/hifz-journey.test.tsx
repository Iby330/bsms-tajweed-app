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
  it("folds every hizb, opening only the one holding the next surah", () => {
    const { container } = render(<HifzJourney list={RUN} records={recs([0,1,2,3,4,5,6,7])} expected={0} />);
    const folds = [...container.querySelectorAll("details")];
    expect(folds.length).toBeGreaterThan(1);
    // every band is a summary, so it toggles natively
    expect(container.querySelectorAll("details > summary.band").length).toBe(folds.length);
    const open = folds.filter((d) => d.hasAttribute("open"));
    expect(open).toHaveLength(1);
    expect(open[0].querySelector(".cell.next")).not.toBeNull();
  });
  it("also opens the hizb carrying the pace marker, so 'behind' is never hidden", () => {
    const { container } = render(<HifzJourney list={RUN} records={recs([0,1])} expected={30} />);
    const open = [...container.querySelectorAll("details[open]")];
    expect(open.length).toBe(2);
    expect(open.some((d) => d.textContent?.includes("Expected here by now"))).toBe(true);
    expect(open.some((d) => d.querySelector(".cell.next"))).toBe(true);
  });
  it("starts fully folded once the list is complete", () => {
    const all = recs(Array.from({ length: 43 }, (_, i) => i));
    const { container } = render(<HifzJourney list={RUN} records={all} expected={30} />);
    expect(container.querySelectorAll("details").length).toBeGreaterThan(1);
    expect(container.querySelectorAll("details[open]").length).toBe(0);
  });
  // ── returning students: last year's hizbs sit above this year's ──────────
  // `earlier` is the run before their start_surah — passed in an earlier year,
  // so there are no hifz_records for them (records only exist from start_surah
  // onward). They must still read as done.
  it("adds no bands for a fresh student, whose earlier run is empty", () => {
    const plain = render(<HifzJourney list={RUN} records={recs([0, 1])} expected={0} />);
    const withEmpty = render(
      <HifzJourney list={RUN} earlier={[]} records={recs([0, 1])} expected={0} />,
    );
    expect(withEmpty.container.querySelectorAll("details").length)
      .toBe(plain.container.querySelectorAll("details").length);
  });

  it("shows last year's hizbs above this year's", () => {
    // starts at surah 86: hizb 60 (114..87) was last year
    const earlier = RUN.slice(0, 28);
    const list = RUN.slice(28);
    const { container } = render(
      <HifzJourney list={list} earlier={earlier} records={new Map()} expected={0} />,
    );
    const bands = [...container.querySelectorAll("details > summary.band .t")]
      .map((e) => e.textContent);
    expect(bands).toEqual(["Hizb 60", "Hizb 59", "Hizb 58"]);
  });

  it("marks an earlier year's surahs done even though they carry no records", () => {
    const earlier = RUN.slice(0, 28);
    const list = RUN.slice(28);
    const { container } = render(
      <HifzJourney list={list} earlier={earlier} records={new Map()} expected={0} />,
    );
    const first = container.querySelector("details");
    expect(first?.querySelectorAll(".cell.done").length).toBe(28);
    expect(first?.textContent).toContain("28 of 28");
  });

  it("does not offer a check for a hizb finished in an earlier year", () => {
    // They sat that check last year; nothing to present now.
    const { container } = render(
      <HifzJourney list={RUN.slice(28)} earlier={RUN.slice(0, 28)} records={new Map()} expected={0} />,
    );
    expect(container.querySelector("details")?.textContent).not.toContain("ready for your check");
  });

  it("starts an earlier year's band folded, and opens this year's current hizb", () => {
    const { container } = render(
      <HifzJourney list={RUN.slice(28)} earlier={RUN.slice(0, 28)} records={new Map()} expected={0} />,
    );
    const open = [...container.querySelectorAll("details[open]")];
    expect(open).toHaveLength(1);
    expect(open[0].querySelector("summary.band .t")?.textContent).toBe("Hizb 59");
  });

  it("numbers cells by programme position, so this year continues last year's count", () => {
    const { container } = render(
      <HifzJourney list={RUN.slice(28)} earlier={RUN.slice(0, 28)} records={new Map()} expected={0} />,
    );
    // surah 86 is the 29th of the run, and says so even though it is this
    // year's first
    const cells = [...container.querySelectorAll(".cell")];
    const s86 = cells.find((c) => c.textContent?.includes("S86"));
    expect(s86?.querySelector(".n")?.textContent).toBe("29");
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<HifzJourney list={[]} records={new Map()} expected={0} />);
    expect(container.innerHTML).toBe("");
  });
});
