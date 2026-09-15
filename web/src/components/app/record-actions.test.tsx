// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { RecordActions } from "./record-actions";

const setComment = vi.hoisted(() => vi.fn(async (_id: string, _n: number, _c: string) => {}));
const unmark = vi.hoisted(() => vi.fn(async (_id: string, _n: number) => {}));
vi.mock("@/lib/hifz/actions", () => ({ setSurahComment: setComment, unmarkSurah: unmark }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RecordActions", () => {
  it("saves only once the comment has changed", () => {
    const { getByRole } = render(<RecordActions studentId="s1" surah={88} comment="rushed" />);
    const save = getByRole("button", { name: "Save comment" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(getByRole("textbox"), { target: { value: "cleaner now" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(setComment).toHaveBeenCalledWith("s1", 88, "cleaner now");
  });

  it("undoes the pass without touching the comment", () => {
    const { getByRole } = render(<RecordActions studentId="s1" surah={88} comment="rushed" />);
    fireEvent.click(getByRole("button", { name: "Undo pass" }));
    expect(unmark).toHaveBeenCalledWith("s1", 88);
    expect(setComment).not.toHaveBeenCalled();
  });
});
