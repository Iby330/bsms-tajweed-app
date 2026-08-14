// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HifzHero } from "./hifz-hero";
import type { HizbBlock } from "@/lib/hifz/hizb";

const block = (hizb: number, count: number, passed: number, state: HizbBlock["state"]): HizbBlock => ({
  hizb,
  surahs: Array.from({ length: count }, (_, i) => ({
    number: 200 - i, order_index: i + 1, name_ar: "س", name_en: `S${i}`,
  })),
  passedCount: passed,
  state,
});
const base = {
  number: 103,
  nameEn: "Al-Ikhlas", nameAr: "الإخلاص",
  meta: { ayahs: 4, meaning: "The Sincerity" },
  juz: { juz: 30, name_en: "Juz 'Amma", name_ar: "عمّ", passed: 12, total: 37 },
  blocks: [block(60, 28, 12, "current"), block(59, 9, 0, "upcoming")],
};

describe("HifzHero footer", () => {
  it("mid-block: shows the toGo line", () => {
    const { container } = render(
      <HifzHero {...base} pace="warn" complete={false} check={{ kind: "toGo", hizb: 60, remaining: 16 }} />,
    );
    expect(container.textContent).toContain("16 surahs");
    expect(container.textContent).toContain("Hizb 60 check");
  });
  it("ready renders even when complete (boundary-aligned target)", () => {
    const { container } = render(
      <HifzHero {...base} pace={null} complete={true} check={{ kind: "ready", hizb: 60 }} />,
    );
    expect(container.textContent).toContain("Ready for your Hizb 60 check");
    expect(container.textContent).toContain("Memorisation target complete");
    // celebration line lives in the journey, not here
    expect(container.textContent).not.toContain("masha");
  });
  it("complete without ready: no footer line, label only", () => {
    const { container } = render(
      <HifzHero {...base} pace={null} complete={true} check={{ kind: "toGo", hizb: 59, remaining: 9 }} />,
    );
    expect(container.textContent).not.toContain("until your");
    expect(container.textContent).toContain("Memorisation target complete");
  });
  it("no pace chip when pace is null", () => {
    const { container } = render(
      <HifzHero {...base} pace={null} complete={false} check={null} />,
    );
    expect(container.textContent).not.toContain("pace");
  });
});
