// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { HearPanel, nextStudent } from "./hear-panel";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
// Records mounts (not renders) so the test can tell a remount (a fresh
// component instance, triggered by the panel's `key`) apart from a same-
// instance re-render.
const { mountCount, lastProps } = vi.hoisted(() => ({
  mountCount: { value: 0 },
  lastProps: { value: null as null | Record<string, unknown> },
}));
vi.mock("./review-logger", () => ({
  ReviewLogger: (props: Record<string, unknown>) => {
    lastProps.value = props;
    useEffect(() => {
      mountCount.value++;
    }, []);
    return <div>logger</div>;
  },
}));

const roster = [
  { id: "s1", name: "Aisha", hasTarget: true },
  { id: "s2", name: "Dawud", hasTarget: false },
  { id: "s3", name: "Bilal", hasTarget: true },
];

// Minimal logger props: ReviewLogger itself is mocked out above.
const base = {
  roster,
  studentId: "s1",
  studentName: "Aisha",
  loggerKey: "new:none",
  sessionId: null,
  initialMistakes: [],
  pages: [],
  heat: {},
  history: {},
  surahNames: {},
  pager: { page: 592, min: 562, max: 604, basePath: "/teacher/hifdh/s1?tab=hear", param: "p" },
  hearing: { from: 88, minEnd: 72, run: [], passedBefore: {} },
  firstPages: { 88: 592, 87: 591 },
  start: vi.fn(async (from: number, to: number) => ({ id: "h1", from, to })),
  done: null,
};

beforeEach(() => { mountCount.value = 0; lastProps.value = null; });
afterEach(() => { cleanup(); push.mockClear(); });

describe("nextStudent", () => {
  it("is the next student down the roster with a target", () => {
    expect(nextStudent(roster, "s1")?.id).toBe("s3");
  });
  it("is null after the last student with a target", () => {
    expect(nextStudent(roster, "s3")).toBeNull();
  });
});

describe("HearPanel", () => {
  it("after a hearing, says what was heard and links the next student's Hear tab", () => {
    render(<HearPanel {...base} done={{ text: "Heard Al-Ghashiyah → Al-A'la · 2 passed · 0 not passed" }} />);
    expect(screen.getByText(/2 passed/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Next student/ });
    expect(link.getAttribute("href")).toBe("/teacher/hifdh/s3?tab=hear");
    expect(link.textContent).toContain("Bilal");
  });

  it("has no next-student link before a hearing is confirmed", () => {
    render(<HearPanel {...base} />);
    expect(screen.queryByRole("link", { name: /Next student/ })).toBeNull();
  });

  it("has no next-student link for the last student with a target", () => {
    render(<HearPanel {...base} studentId="s3" studentName="Bilal" done={{ text: "Heard Al-Layl · 1 passed · 0 not passed" }} />);
    expect(screen.queryByRole("link", { name: /Next student/ })).toBeNull();
  });

  it("Start goes to the From surah's first page; Confirm names the hearing just done", async () => {
    render(<HearPanel {...base} />);
    const hearing = lastProps.value!.hearing as {
      start: (r: { from: number; to: number }) => Promise<unknown>;
      onStarted: (h: { id: string; from: number; to: number }) => void;
      onFinished: (id: string) => void;
    };
    await expect(hearing.start({ from: 87, to: 86 })).resolves.toEqual({ id: "h1", from: 87, to: 86 });
    expect(base.start).toHaveBeenCalledWith(87, 86);
    hearing.onStarted({ id: "h1", from: 87, to: 86 });
    expect(push).toHaveBeenCalledWith("/teacher/hifdh/s1?tab=hear&p=591", { scroll: false });
    hearing.onFinished("h1");
    expect(push).toHaveBeenCalledWith("/teacher/hifdh/s1?tab=hear&done=h1");
  });

  it("remounts the logger when its key changes, so a finished hearing's state cannot leak", () => {
    const { rerender } = render(<HearPanel {...base} />);
    expect(mountCount.value).toBe(1);
    rerender(<HearPanel {...base} loggerKey="h1" sessionId="h1" />);
    expect(mountCount.value).toBe(2);
  });
});
