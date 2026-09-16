// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingDesk } from "./hearing-desk";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const roster = [
  { id: "s1", name: "Aisha", nextSurah: 88, nextName: "Al-Ghashiyah" },
  { id: "s2", name: "Bilal", nextSurah: 92, nextName: "Al-Layl" },
  { id: "s3", name: "Dawud", nextSurah: null, nextName: null },
];

afterEach(() => { cleanup(); push.mockClear(); });

describe("HearingDesk", () => {
  it("changes student through the URL", () => {
    render(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]} done={null}>
      <div>mushaf</div>
    </HearingDesk>);
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s2" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifz/hear?student=s2");
  });
  it("lets the start change until the draft has marks", () => {
    const run = [{ number: 88, name_en: "Al-Ghashiyah" }, { number: 87, name_en: "Al-A'la" }];
    const { rerender } = render(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={run} done={null}><div /></HearingDesk>);
    fireEvent.change(screen.getByLabelText("Starting at"), { target: { value: "87" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifz/hear?student=s1&from=87");
    rerender(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={true} run={run} done={null}><div /></HearingDesk>);
    expect((screen.getByLabelText("Starting at") as HTMLSelectElement).disabled).toBe(true);
  });
  it("offers the next student after a hearing", () => {
    render(<HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]}
      done={{ text: "Heard Al-Ghashiyah → Al-A'la · 2 passed · 0 not passed" }}><div /></HearingDesk>);
    expect(screen.getByText(/2 passed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Next student/ }).getAttribute("href")).toBe("/teacher/hifz/hear?student=s2");
  });
});
