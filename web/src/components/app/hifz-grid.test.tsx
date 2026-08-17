// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { HifzGrid, type MarkRow } from "./hifz-grid";

// The grid is what's under test, not the server actions or the router.
const mark = vi.hoisted(() => vi.fn(async (_id: string, _n: number, _c?: string) => {}));
const unmark = vi.hoisted(() => vi.fn(async (_id: string, _n: number) => {}));
const setComment = vi.hoisted(() => vi.fn(async (_id: string, _n: number, _c: string) => {}));
vi.mock("@/lib/hifz/actions", () => ({
  markSurahPassed: mark,
  unmarkSurah: unmark,
  setSurahComment: setComment,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/** 43 surahs, An-Nas (114) down to Al-Qalam (68) — the standard run. */
const run = (passedTo: number, over: Partial<MarkRow> & { number?: number } = {}): MarkRow[] =>
  Array.from({ length: 43 }, (_, i) => {
    const base: MarkRow = {
      number: 114 - i,
      name_en: `S${114 - i}`,
      name_ar: `س${114 - i}`,
      passed: i < passedTo,
      comment: null,
      passedAt: i < passedTo ? "2026-09-19" : null,
    };
    return over.number === base.number ? { ...base, ...over } : base;
  });

const cellFor = (container: HTMLElement, nameEn: string) => {
  const cell = [...container.querySelectorAll("button.cell")].find((b) =>
    b.textContent?.startsWith(nameEn) || b.querySelector(".en")?.textContent?.startsWith(nameEn),
  );
  if (!cell) throw new Error(`no cell for ${nameEn}`);
  return cell;
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HifzGrid", () => {
  it("renders nothing without a run", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={[]} expected={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("marks the first unpassed surah as next and the passed ones as done", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(3)} expected={3} />);
    expect(container.querySelectorAll(".cell.done").length).toBe(3);
    expect(cellFor(container, "S111").className).toContain("next");
  });

  it("opens no panel until a cell is clicked, then closes on a second click", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(0)} expected={0} />);
    expect(container.querySelector(".markpanel")).toBeNull();

    fireEvent.click(cellFor(container, "S114"));
    expect(container.querySelector(".markpanel")).not.toBeNull();
    expect(cellFor(container, "S114").className).toContain("sel");

    fireEvent.click(cellFor(container, "S114"));
    expect(container.querySelector(".markpanel")).toBeNull();
  });

  it("passes a surah with the comment typed into the panel", async () => {
    const { container, getByRole } = render(
      <HifzGrid studentId="s1" rows={run(0)} expected={0} />,
    );
    fireEvent.click(cellFor(container, "S114"));
    fireEvent.change(getByRole("textbox"), { target: { value: "  watch the madd  " } });
    fireEvent.click(getByRole("button", { name: "Mark passed" }));

    expect(mark).toHaveBeenCalledWith("s1", 114, "  watch the madd  ");
    // Trimming is the action's job, not the panel's — it stores null for blank.
    expect(unmark).not.toHaveBeenCalled();
  });

  it("offers Undo and comment editing on a surah already passed", () => {
    const { container, getByRole, queryByRole } = render(
      <HifzGrid studentId="s1" rows={run(2)} expected={2} />,
    );
    fireEvent.click(cellFor(container, "S114"));

    expect(queryByRole("button", { name: "Mark passed" })).toBeNull();
    // Nothing changed yet, so there is nothing to save.
    expect((getByRole("button", { name: "Save comment" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(getByRole("textbox"), { target: { value: "cleaner now" } });
    fireEvent.click(getByRole("button", { name: "Save comment" }));
    expect(setComment).toHaveBeenCalledWith("s1", 114, "cleaner now");
  });

  it("undoes a pass without touching the comment", () => {
    const { container, getByRole } = render(
      <HifzGrid studentId="s1" rows={run(2)} expected={2} />,
    );
    fireEvent.click(cellFor(container, "S114"));
    fireEvent.click(getByRole("button", { name: "Undo pass" }));

    expect(unmark).toHaveBeenCalledWith("s1", 114);
    expect(setComment).not.toHaveBeenCalled();
  });

  it("loads the existing comment into the panel and flags the cell", () => {
    const rows = run(2, { number: 113, comment: "rushed the ending" });
    const { container, getByRole } = render(<HifzGrid studentId="s1" rows={rows} expected={2} />);
    expect(cellFor(container, "S113").querySelector(".cmt")).not.toBeNull();

    fireEvent.click(cellFor(container, "S113"));
    expect((getByRole("textbox") as HTMLTextAreaElement).value).toBe("rushed the ending");
  });

  it("closes the panel on Escape", () => {
    const { container } = render(<HifzGrid studentId="s1" rows={run(0)} expected={0} />);
    fireEvent.click(cellFor(container, "S114"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".markpanel")).toBeNull();
  });

  it("shows the pace rule only when the student is genuinely behind", () => {
    const behind = render(<HifzGrid studentId="s1" rows={run(2)} expected={8} />);
    expect(behind.container.textContent).toContain("Expected here by now");
    cleanup();

    // expected = passed + 1 lands on the surah they are already on: no rule.
    const onIt = render(<HifzGrid studentId="s1" rows={run(8)} expected={9} />);
    expect(onIt.container.textContent).not.toContain("Expected here by now");
    cleanup();

    const done = render(<HifzGrid studentId="s1" rows={run(43)} expected={30} />);
    expect(done.container.textContent).not.toContain("Expected here by now");
    expect(done.container.querySelector(".cell.next")).toBeNull();
  });

  it("says a hizb is ready for the check only when all of it is on the run and passed", () => {
    // The run starts at An-Nas, so its first band is hizb 60 entire (114–78).
    const { container } = render(<HifzGrid studentId="s1" rows={run(43)} expected={43} />);
    expect(container.textContent).toContain("ready for the check");
  });
});
