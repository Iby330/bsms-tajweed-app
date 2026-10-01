// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingStart } from "./hearing-start";

// The student's run, in memorisation order: down the mushaf.
const run = [
  { number: 89, name: "Al-Fajr" },
  { number: 88, name: "Al-Ghashiyah" },
  { number: 87, name: "Al-A'la" },
  { number: 86, name: "At-Tariq" },
];
const base = { open: true, onOpenChange: vi.fn(), studentName: "Aisha", run, pending: false };

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const values = (label: string) => [...select(label).options].map((o) => Number(o.value));

afterEach(cleanup);

describe("HearingStart", () => {
  it("is headed with the student's name", () => {
    render(<HearingStart {...base} defaultFrom={88} onStart={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Hearing Aisha" })).toBeTruthy();
  });

  it("From defaults to the next surah and To to the same surah", () => {
    render(<HearingStart {...base} defaultFrom={88} onStart={vi.fn()} />);
    expect(select("From").value).toBe("88");
    expect(select("To").value).toBe("88");
    expect(values("From")).toEqual([89, 88, 87, 86]);
  });

  it("To never offers a surah above From", () => {
    render(<HearingStart {...base} defaultFrom={88} onStart={vi.fn()} />);
    expect(values("To")).toEqual([88, 87, 86]);
    fireEvent.change(select("From"), { target: { value: "87" } });
    expect(values("To")).toEqual([87, 86]);
    expect(select("To").value).toBe("87");
  });

  it("Start calls back with the chosen range", () => {
    const onStart = vi.fn();
    render(<HearingStart {...base} defaultFrom={88} onStart={onStart} />);
    fireEvent.change(select("To"), { target: { value: "86" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledWith({ from: 88, to: 86 });
  });

  it("Start is disabled while pending", () => {
    const onStart = vi.fn();
    render(<HearingStart {...base} pending defaultFrom={88} onStart={onStart} />);
    const button = screen.getByRole("button", { name: "Starting…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });
});
