// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { MistakeSheet } from "./mistake-sheet";
import type { QuranWord } from "@/lib/quran/mushaf";

const word: QuranWord = {
  surah: 114, ayah: 1, position: 4, text: "ٱلنَّاسِ", glyph: null, isEnd: false, page: 604, line: 12,
};

// Dialog renders are slow under full-suite worker contention — the default
// 5s timeout flakes even though every interaction completes.
const SLOW = 20_000;

describe("MistakeSheet", () => {
  it("saves category + detail + note", () => {
    const onSave = vi.fn();
    render(<MistakeSheet word={word} onSave={onSave} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Tajweed" }));
    fireEvent.click(screen.getByRole("button", { name: "Ikhfa" }));
    fireEvent.change(screen.getByPlaceholderText(/note/i), { target: { value: "rushed it" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ category: "tajweed", detail: "ikhfa", note: "rushed it" });
  }, SLOW);
  it("offers the tapped word's letters for makhraj", () => {
    render(<MistakeSheet word={word} onSave={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Makhraj" }));
    expect(screen.getByRole("button", { name: "ن" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "س" })).toBeTruthy();
  }, SLOW);
  it("shows remove for existing marks and calls it", () => {
    const onRemove = vi.fn();
    render(
      <MistakeSheet word={word} onSave={() => {}} onRemove={onRemove} onClose={() => {}}
        existing={{ category: "hifz", detail: "forgot", note: null }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalled();
  }, SLOW);
});
