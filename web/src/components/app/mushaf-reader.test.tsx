// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MushafReader } from "./mushaf-reader";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", glyph: null, isEnd: false, page: 604, line: 12, ...over,
});
// 5 tokens on one line (so it renders justified) + one word on the next
const line = [
  w({}), w({ position: 2, text: "أَعُوذُ" }), w({ position: 3, text: "بِرَبِّ" }),
  w({ position: 4, text: "ٱلنَّاسِ" }), w({ position: 5, text: "١", isEnd: true }),
  w({ ayah: 2, position: 1, text: "مَلِكِ", line: 13 }),
];

describe("MushafReader", () => {
  it("renders pages, lines and words in order", () => {
    const { container } = render(<MushafReader pages={groupIntoPages(line)} />);
    expect(container.textContent).toContain("604");
    expect(container.textContent).toContain("قُلْ");
    // two printed lines + the basmala (the fixture starts at ayah 1, word 1)
    expect(container.querySelectorAll("[dir='rtl']")).toHaveLength(3);
  });
  it("every token is tappable when onWordTap given, end markers included", () => {
    const onTap = vi.fn();
    const { container } = render(<MushafReader pages={groupIntoPages(line)} onWordTap={onTap} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(6); // all 6 tokens — the marker selects its ayah
    fireEvent.click(buttons[0]);
    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ ayah: 1, position: 1 }));
  });
  // Scoped to `container`: this suite has no auto-cleanup, so document-wide
  // queries would also see the trees mounted by the tests above.
  it("hands the end marker back so the caller can scope to the ayah", () => {
    const onTap = vi.fn();
    const { container } = render(<MushafReader pages={groupIntoPages(line)} onWordTap={onTap} />);
    const marker = container.querySelector<HTMLElement>('[aria-label="Ayah 1"]')!;
    expect(marker.textContent).toBe("١");
    fireEvent.click(marker);
    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ ayah: 1, isEnd: true }));
  });
  it("applies mark and heat tints by word key", () => {
    const { container } = render(
      <MushafReader pages={groupIntoPages(line)}
        marks={{ "114:1:2": { category: "tajweed" } }}
        heat={{ "114:2:1": "bg-warn/40" }} />,
    );
    expect(container.querySelector(".bg-danger\\/25")?.textContent).toBe("أَعُوذُ");
    expect(container.querySelector(".bg-warn\\/40")?.textContent).toBe("مَلِكِ");
  });
  it("an ayah-keyed mark tints every word of that ayah, marker included", () => {
    const { container } = render(
      <MushafReader pages={groupIntoPages(line)} marks={{ "114:1": { category: "hifz" } }} />,
    );
    const tinted = [...container.querySelectorAll(".bg-danger\\/25")].map((e) => e.textContent);
    // ayah 1 is قُل أعوذ برب الناس + its marker; ayah 2's مَلِكِ stays cold
    expect(tinted).toEqual(["قُلْ", "أَعُوذُ", "بِرَبِّ", "ٱلنَّاسِ", "١"]);
  });
});
