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

  it("Confirm is disabled while pending, and does nothing if clicked", () => {
    const onConfirm = vi.fn();
    render(<HearingFinish {...base} initialEnd={86} pending onConfirm={onConfirm} />);
    const confirm = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("both movers are disabled from the start when minEnd equals from", () => {
    render(<HearingFinish {...base} from={88} minEnd={88} initialEnd={88} onConfirm={vi.fn()} />);
    expect((screen.getByRole("button", { name: "One more" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "One fewer" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a new start resets the end and never inverts the range", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<HearingFinish {...base} from={88} initialEnd={86} onConfirm={onConfirm} />);
    // The "Starting at" select moved to a lower start than the stale `end`
    // (85 < 86) — this used to reach rangeSurahs(85, 86) and throw.
    expect(() =>
      rerender(<HearingFinish {...base} from={85} initialEnd={85} onConfirm={onConfirm} />),
    ).not.toThrow();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBe(1);
    expect(screen.getByLabelText(/Al-Buruj/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: 85, passed: [85], note: "" });
  });

  describe("the To select", () => {
    const run = [88, 87, 86, 85];

    it("lists From down to minEnd, regardless of the current end", () => {
      render(
        <HearingFinish {...base} minEnd={85} initialEnd={87} onConfirm={vi.fn()}
          fromChoices={run} onFromChange={vi.fn()} />,
      );
      const to = screen.getByLabelText("To") as HTMLSelectElement;
      const labels = Array.from(to.options).map((o) => o.textContent);
      expect(labels).toEqual(["Al-Ghashiyah", "Al-A'la", "At-Tariq", "Al-Buruj"]);
    });

    it("picking a To shows the right rows all ticked and Confirm sends to/passed accordingly", () => {
      const onConfirm = vi.fn();
      render(
        <HearingFinish {...base} minEnd={85} initialEnd={88} onConfirm={onConfirm}
          fromChoices={run} onFromChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "86" } });
      const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(boxes.map((b) => b.checked)).toEqual([true, true, true]);
      fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
      expect(onConfirm).toHaveBeenCalledWith({ to: 86, passed: [88, 87, 86], note: "" });
    });

    it("an untick on a surah that stays in range survives a To change", () => {
      render(
        <HearingFinish {...base} minEnd={85} initialEnd={87} onConfirm={vi.fn()}
          fromChoices={run} onFromChange={vi.fn()} />,
      );
      fireEvent.click(screen.getByLabelText(/Al-A'la/)); // untick 87, in range both before and after
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "86" } });
      const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
    });

    it("One more after picking a To moves the To select too", () => {
      render(
        <HearingFinish {...base} minEnd={85} initialEnd={88} onConfirm={vi.fn()}
          fromChoices={run} onFromChange={vi.fn()} />,
      );
      fireEvent.change(screen.getByLabelText("To"), { target: { value: "87" } });
      fireEvent.click(screen.getByRole("button", { name: "One more" }));
      expect((screen.getByLabelText("To") as HTMLSelectElement).value).toBe("86");
    });

    it("changing From above the end resets the end, and the To select follows", () => {
      const onFromChange = vi.fn();
      const { rerender } = render(
        <HearingFinish {...base} minEnd={85} from={86} initialEnd={86} onConfirm={vi.fn()}
          fromChoices={run} onFromChange={onFromChange} />,
      );
      rerender(
        <HearingFinish {...base} minEnd={85} from={88} initialEnd={88} onConfirm={vi.fn()}
          fromChoices={run} onFromChange={onFromChange} />,
      );
      expect((screen.getByLabelText("To") as HTMLSelectElement).value).toBe("88");
    });
  });
});
