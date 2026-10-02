// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ResultButton } from "./result-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/hifz/hearing-actions", () => ({ recordResults: vi.fn(async () => {}) }));
import { recordResults } from "@/lib/hifz/hearing-actions";

const names = {
  88: { en: "Al-Ghashiyah", ar: "الغاشية" },
  87: { en: "Al-A'la", ar: "الأعلى" },
  86: { en: "At-Tariq", ar: "الطارق" },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SLOW = 20_000;

/** What the student's own page renders: the button and, behind it, the popup. */
describe("ResultButton", () => {
  it("opens the result popup at the student's next surah and submits the range, ticks and note", async () => {
    render(<ResultButton studentId="s1" studentName="Ali" run={[88, 87, 86]} from={88} names={names} passedBefore={{}} />);
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pass / Not passed" }));
    expect(screen.getByRole("heading", { name: "Pass / Not passed for Ali" })).toBeTruthy();
    expect(screen.queryByText(/Finish hearing/)).toBeNull();
    expect((screen.getByLabelText("From") as HTMLSelectElement).value).toBe("88");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    fireEvent.click(screen.getByLabelText(/Al-A'la/));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "madd in ayah 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(recordResults).toHaveBeenCalledWith(
      "s1", { from: 88, to: 86, passed: [88, 86], note: "madd in ayah 3" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
  }, SLOW);

  it("From can start the range further on in the run", async () => {
    render(<ResultButton studentId="s1" studentName="Ali" run={[88, 87, 86]} from={88} names={names} passedBefore={{ 88: "2026-09-12" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Pass / Not passed" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "87" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(recordResults).toHaveBeenCalledWith(
      "s1", { from: 87, to: 87, passed: [87], note: "" }));
  }, SLOW);

  it("opens with an empty note the next time, so an old note is never sent with a new result", async () => {
    render(<ResultButton studentId="s1" studentName="Ali" run={[88, 87, 86]} from={88} names={names} passedBefore={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Pass / Not passed" }));
    fireEvent.change(screen.getByPlaceholderText("Note for the student (optional)"), {
      target: { value: "madd in ayah 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull());
    // The closing dialog keeps the page inert for a moment; reopen once it lets go.
    await vi.waitFor(() => fireEvent.click(screen.getByRole("button", { name: "Pass / Not passed" })));
    expect((screen.getByPlaceholderText("Note for the student (optional)") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(recordResults).toHaveBeenLastCalledWith(
      "s1", { from: 88, to: 88, passed: [88], note: "" }));
  }, SLOW);

  it("the To select lets the teacher jump straight to an end surah", async () => {
    render(<ResultButton studentId="s1" studentName="Ali" run={[88, 87, 86]} from={88} names={names} passedBefore={{}} />);
    fireEvent.click(screen.getByRole("button", { name: "Pass / Not passed" }));
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "86" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(recordResults).toHaveBeenCalledWith(
      "s1", { from: 88, to: 86, passed: [88, 87, 86], note: "" }));
  }, SLOW);
});
