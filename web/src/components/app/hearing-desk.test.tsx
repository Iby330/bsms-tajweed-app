// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HearingDesk, NoTargetDesk } from "./hearing-desk";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// Records mounts (not renders) so the test can tell a remount (a fresh
// component instance, triggered by the desk's `key`) apart from a same-
// instance re-render — the very distinction the key fix depends on.
const { mountCount } = vi.hoisted(() => ({ mountCount: { value: 0 } }));
vi.mock("./review-logger", () => ({
  ReviewLogger: () => {
    useEffect(() => {
      mountCount.value++;
    }, []);
    return <div>logger</div>;
  },
}));

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
  pager: { page: 592, min: 562, max: 604, basePath: "/teacher/hifdh/hear?student=s1&from=88", param: "p" },
  hearing: { from: 88, minEnd: 72, passedBefore: {} },
};

beforeEach(() => { mountCount.value = 0; });
afterEach(() => { cleanup(); push.mockClear(); });

describe("HearingDesk", () => {
  it("changes student through the URL", () => {
    render(
      <HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]} done={null} {...loggerProps} />,
    );
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s2" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifdh/hear?student=s2");
  });

  it("lets the start change until a hearing is open", () => {
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
    expect(screen.getByLabelText("Starting at").closest("[title]")?.getAttribute("title"))
      .toBe("The start is fixed while a hearing is open");
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

  it("remounts the logger when the student changes, so its state can't leak across students", () => {
    const { rerender } = render(
      <HearingDesk roster={roster} studentId="s1" from={88} draftStarted={false} run={[]} done={null} {...loggerProps} />,
    );
    expect(mountCount.value).toBe(1);
    rerender(
      <HearingDesk roster={roster} studentId="s2" from={88} draftStarted={false} run={[]} done={null} {...loggerProps} />,
    );
    expect(mountCount.value).toBe(2);
  });
});

describe("NoTargetDesk", () => {
  it("keeps the student picker and says why there is nothing to hear", () => {
    render(<NoTargetDesk roster={roster} studentId="s3" />);
    expect((screen.getByLabelText("Student") as HTMLSelectElement).value).toBe("s3");
    expect(screen.queryByLabelText("Starting at")).toBeNull();
    expect(screen.getByText("No target set for this student yet.")).toBeTruthy();
    expect(mountCount.value).toBe(0);
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "s1" } });
    expect(push).toHaveBeenCalledWith("/teacher/hifdh/hear?student=s1");
  });
});
