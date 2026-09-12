// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { MistakeSheet } from "./mistake-sheet";
import type { QuranWord } from "@/lib/quran/mushaf";

const word: QuranWord = {
  surah: 114, ayah: 1, position: 4, text: "ٱلنَّاسِ", glyph: null, isEnd: false, page: 604, line: 12,
};

// Dialog renders are slow under full-suite worker contention — the default
// 5s timeout flakes even though every interaction completes.
const SLOW = 20_000;

// The dialog portals into document.body, so `screen` is the only way to see
// it — and with no global setup file there is no auto-cleanup, so without
// this every test would also match the dialogs left behind by the ones above.
afterEach(cleanup);

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
  // Arabic letters must read right-to-left: the word's first letter belongs
  // on the RIGHT, and in reading order across the row.
  it("lays the makhraj letters out RTL, in the word's own order", () => {
    render(<MistakeSheet word={word} onSave={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Makhraj" }));
    const row = screen.getByRole("button", { name: "ن" }).parentElement!;
    expect(row.getAttribute("dir")).toBe("rtl");
    // ٱلنَّاسِ → ا ل ن س in reading order, first letter first in the DOM
    expect([...row.children].map((c) => c.textContent)).toEqual(["ا", "ل", "ن", "س"]);
  }, SLOW);
  // Tapping an ayah's end marker classifies the whole ayah. Makhraj cannot
  // apply — its detail is a letter of one word — so the chip is withheld,
  // and the DB carries the same check.
  it("scopes to the whole ayah for an end marker, without makhraj", () => {
    const onSave = vi.fn();
    const marker: QuranWord = { ...word, position: 5, text: "١", isEnd: true };
    render(<MistakeSheet word={marker} onSave={onSave} onClose={() => {}} />);
    expect(screen.getByText("Whole ayah")).toBeTruthy();
    expect(screen.getByText("114:1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hifdh" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Makhraj" })).toBeNull();
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
