// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingFinish } from "./hearing-finish";

const names = {
  88: { en: "Al-Ghashiyah", ar: "الغاشية" },
  87: { en: "Al-A'la", ar: "الأعلى" },
  86: { en: "At-Tariq", ar: "الطارق" },
  85: { en: "Al-Buruj", ar: "البروج" },
};
const base = {
  open: true, onOpenChange: vi.fn(), from: 88, minEnd: 78, names,
  passedBefore: {} as Record<number, string>, pending: false,
};

afterEach(cleanup);

describe("HearingFinish", () => {
  it("lists the range as ticked rows and confirms them all", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={86} onConfirm={onConfirm} />);
    expect(screen.getByText(/Al-Ghashiyah → At-Tariq · 3 surahs/)).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 86, passed: [88, 87, 86], note: "" });
  });

  it("an unticked surah is left out of passed, with the note", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={86} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByLabelText(/At-Tariq/));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "madd in āyah 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 86, passed: [88, 87], note: "madd in āyah 3" });
  });

  it("names a surah that was passed before, so unticking it is a choice", () => {
    render(<HearingFinish {...base} initialEnd={87} passedBefore={{ 88: "2026-06-12" }} onConfirm={vi.fn()} />);
    expect(screen.getByText(/passed 12 Jun/)).toBeTruthy();
  });

  it("One more and One fewer move the end within the run", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={87} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    expect(screen.getAllByRole("checkbox").length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "One fewer" }));
    expect(screen.getAllByRole("checkbox").length).toBe(1);
    expect((screen.getByRole("button", { name: "One fewer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 88, passed: [88], note: "" });
  });

  it("a surah widened into the range arrives ticked", () => {
    render(<HearingFinish {...base} initialEnd={88} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Al-Ghashiyah/));   // untick 88
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, true]);
  });
});
