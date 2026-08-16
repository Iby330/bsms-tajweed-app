// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MushafReader } from "./mushaf-reader";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 114, ayah: 1, position: 1, text: "قُلْ", isEnd: false, page: 604, line: 12, ...over,
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
    expect(container.textContent).toContain("page 604");
    expect(container.textContent).toContain("قُلْ");
    expect(container.querySelectorAll("[dir='rtl']")).toHaveLength(2); // two lines
  });
  it("end markers are not tappable; words are when onWordTap given", () => {
    const onTap = vi.fn();
    const { container } = render(<MushafReader pages={groupIntoPages(line)} onWordTap={onTap} />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(5); // 6 tokens minus the end marker
    fireEvent.click(buttons[0]);
    expect(onTap).toHaveBeenCalledWith(expect.objectContaining({ ayah: 1, position: 1 }));
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
});
