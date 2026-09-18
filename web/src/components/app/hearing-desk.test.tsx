// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingDesk } from "./hearing-desk";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("./review-logger", () => ({ ReviewLogger: () => <div>logger</div> }));

const roster = [
  { id: "s1", name: "Aisha", nextSurah: 88, nextName: "Al-Ghashiyah" },
  { id: "s2", name: "Bilal", nextSurah: 92, nextName: "Al-Layl" },
  { id: "s3", name: "Dawud", nextSurah: null, nextName: null },
];

// Minimal logger props — ReviewLogger itself is mocked out above, so these
// just need to satisfy the types.
const loggerProps = {
  session: { sessionId: null as string | null, ensureSession: vi.fn(async () => "sess1"), initialMistakes: [] },
  reciterName: "Aisha",
  pages: [],
  heat: {},
  history: {},
  surahNames: {},
  hearing: { from: 88, minEnd: 72, passedBefore: {} },
};

afterEach(() => { cleanup(); push.mockClear(); });

describe("HearingDesk", () => {
  it("changes student through the URL", () => {
    render(
      <HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]} done={null} {...loggerProps} />,
    );
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s2" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifdh/hear?student=s2");
  });

  it("lets the start change until the draft has marks", () => {
    const run = [{ number: 88, name_en: "Al-Ghashiyah" }, { number: 87, name_en: "Al-A'la" }];
    const { rerender } = render(
      <HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={run} done={null} {...loggerProps} />,
    );
    fireEvent.change(screen.getByLabelText("Starting at"), { target: { value: "87" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifdh/hear?student=s1&from=87");
    rerender(
      <HearingDesk roster={roster} studentId="s1" from={88} draftStarted={true} run={run} done={null} {...loggerProps} />,
    );
    expect((screen.getByLabelText("Starting at") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText(/Hearing in progress/)).toBeTruthy();
  });

  it("offers the next student after a hearing", () => {
    render(
      <HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]}
        done={{ text: "Heard Al-Ghashiyah → Al-A'la · 2 passed · 0 not passed" }} {...loggerProps} />,
    );
    expect(screen.getByText(/2 passed/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Next student/ }).getAttribute("href")).toBe("/teacher/hifdh/hear?student=s2");
  });

  it("has no next-student link when the chosen student is the last with a target", () => {
    render(
      <HearingDesk roster={roster} studentId="s2" from={92} draftStarted={false} run={[]}
        done={{ text: "Heard Al-Layl · 1 passed · 0 not passed" }} {...loggerProps} />,
    );
    expect(screen.queryByRole("link", { name: /Next student/ })).toBeNull();
  });
});
