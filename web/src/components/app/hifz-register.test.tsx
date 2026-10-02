// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { HifzRegister, type RegisterRow } from "./hifz-register";
import type { Surah } from "@/lib/hifz/pace";

// The register is what's under test, not the server actions or the router.
const setStudent = vi.hoisted(() =>
  vi.fn(async (_id: string, _start: number, _count: number) => {}),
);
const setForStudents = vi.hoisted(() =>
  vi.fn(async (_ids: string[], _end: number) => ({ applied: 2, skipped: [] as string[] })),
);
vi.mock("@/lib/hifz/actions", () => ({
  setStudentHifzProfile: setStudent,
  setTargetForStudents: setForStudents,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const record = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/hifz/hearing-actions", () => ({ recordResults: record }));

const surahs: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${114 - i}`,
  name_en: `S${114 - i}`,
}));

const row = (over: Partial<RegisterRow> & { studentId: string; name: string }): RegisterRow => ({
  nextName: null,
  passed: 0,
  target: 0,
  expected: 0,
  pace: null,
  startSurah: 114,
  run: [],
  from: null,
  passedBefore: {},
  ...over,
});

const ALI = row({ studentId: "s1", name: "Ali" });
const BILAL = row({ studentId: "s2", name: "Bilal", startSurah: 80 }); // returning

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HifzRegister — selection", () => {
  it("counts the selection and clears it", () => {
    const { getByLabelText, getByText } = render(<HifzRegister rows={[ALI, BILAL]} surahs={surahs} />);
    fireEvent.click(getByLabelText("Select Ali"));
    expect(getByText("1 of 2 selected")).toBeTruthy();
    fireEvent.click(getByText("Clear"));
    expect(getByText("Select students to set a target.")).toBeTruthy();
  });

  it("select all + an end surah applies one goal to every id", async () => {
    const { getByText, getByLabelText } = render(<HifzRegister rows={[ALI, BILAL]} surahs={surahs} />);
    fireEvent.click(getByText("Select all"));
    fireEvent.change(getByLabelText("Up to"), { target: { value: "78" } });
    fireEvent.click(getByText("Apply to 2 students"));

    await vi.waitFor(() => expect(getByText(/Applied to 2 students/)).toBeTruthy());
    expect(setForStudents.mock.calls[0][0]).toEqual(["s1", "s2"]);
    expect(setForStudents.mock.calls[0][1]).toBe(78);
  });

  it("names the students an apply skipped", async () => {
    setForStudents.mockResolvedValueOnce({ applied: 1, skipped: ["Bilal"] });
    const { getByText, getByLabelText } = render(<HifzRegister rows={[ALI, BILAL]} surahs={surahs} />);
    fireEvent.click(getByText("Select all"));
    fireEvent.change(getByLabelText("Up to"), { target: { value: "87" } });
    fireEvent.click(getByText("Apply to 2 students"));

    await vi.waitFor(() => expect(getByText(/Skipped Bilal/)).toBeTruthy());
  });

  it("multi-select hides the starts-at picker — a start is one student's fact", () => {
    const { getByText, queryByLabelText, getByLabelText } = render(
      <HifzRegister rows={[ALI, BILAL]} surahs={surahs} />,
    );
    fireEvent.click(getByLabelText("Select Ali"));
    expect(queryByLabelText("Starts at")).toBeTruthy();
    fireEvent.click(getByLabelText("Select Bilal"));
    expect(getByText("Target for 2 students")).toBeTruthy();
    expect(queryByLabelText("Starts at")).toBeNull();
  });
});

describe("HifzRegister — one student", () => {
  it("presets count from the student's own start and save sends start + count", async () => {
    const { getByText, getByLabelText } = render(<HifzRegister rows={[ALI, BILAL]} surahs={surahs} />);
    fireEvent.click(getByLabelText("Select Bilal"));

    // Bilal starts at 80, inside hizb 59 — finishing it is 3 surahs.
    fireEvent.click(getByText("To end of Hizb 59 · 3"));
    fireEvent.click(getByText("Save target"));

    await vi.waitFor(() => expect(getByText(/Bilal's target is 3 surahs/)).toBeTruthy());
    expect(setStudent).toHaveBeenCalledWith("s2", 80, 3);
  });

  it("moving the start re-derives the preset counts", () => {
    const { getByText, getByLabelText, queryByText } = render(
      <HifzRegister rows={[ALI, BILAL]} surahs={surahs} />,
    );
    fireEvent.click(getByLabelText("Select Bilal"));
    fireEvent.change(getByLabelText("Starts at"), { target: { value: "114" } });
    expect(getByText("To end of Hizb 60 · 28")).toBeTruthy();
    expect(queryByText("To end of Hizb 59 · 3")).toBeNull();
  });
});

describe("HifzRegister — results", () => {
  const AISHA = row({
    studentId: "s3", name: "Aisha", target: 3, nextName: "S113",
    run: [114, 113, 112], from: 113, passedBefore: { 114: "2026-09-10" },
  });

  it("only a student with a target gets the Pass / Not passed button", () => {
    const { getAllByRole } = render(<HifzRegister rows={[ALI, AISHA]} surahs={surahs} />);
    expect(getAllByRole("button", { name: "Pass / Not passed" })).toHaveLength(1);
  });

  it("the row's button opens the result popup for that student and submits recordResults", async () => {
    const { getByRole, getByLabelText, getByPlaceholderText } =
      render(<HifzRegister rows={[ALI, AISHA]} surahs={surahs} />);
    fireEvent.click(getByRole("button", { name: "Pass / Not passed" }));
    fireEvent.click(getByRole("button", { name: "One more" }));
    fireEvent.click(getByLabelText(/S113/));
    fireEvent.change(getByPlaceholderText("Note for the student (optional)"), { target: { value: "again" } });
    fireEvent.click(getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() =>
      expect(record).toHaveBeenCalledWith("s3", { from: 113, to: 112, passed: [112], note: "again" }));
  }, 20_000);
});
