// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { UndoRedo } from "./submission-action";

// The component is under test, not the server action: it is mocked with its
// real shape so the calls can be asserted on.
const undo = vi.hoisted(() =>
  vi.fn<(submissionId: string) => Promise<{ error: string | null }>>(),
);
vi.mock("@/lib/marking/actions", () => ({
  undoRedo: undo,
  reopenSubmission: vi.fn(),
  liftRedoCap: vi.fn(),
  clearLate: vi.fn(),
}));

beforeEach(() => {
  undo.mockReset();
  undo.mockResolvedValue({ error: null });
});
// No vitest globals here, so testing-library never cleans up on its own.
afterEach(cleanup);

const button = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent === text);

function undoRedo(capped = true) {
  return render(<UndoRedo submissionId="s1" studentName="Adam Whitfield" capped={capped} />);
}

describe("UndoRedo", () => {
  it("starts as one outline button and does nothing on its own", () => {
    const { container } = undoRedo();
    expect(button(container, "Undo the redo")).toBeTruthy();
    expect(button(container, "Yes, undo the redo")).toBeUndefined();
    expect(undo).not.toHaveBeenCalled();
  });

  it("asks first, in plain words, before undoing anything", () => {
    const { container } = undoRedo();
    fireEvent.click(button(container, "Undo the redo")!);

    const text = container.textContent ?? "";
    expect(text).toContain("Take back the redo you sent Adam Whitfield?");
    expect(text).toContain("The paper comes back to you to mark");
    expect(text).toContain("answers, recordings and your marks as they were");
    expect(text).toContain("Correct the mark and release it again.");
    expect(text).toContain("The 60% cap on the redo goes too.");
    expect(text).toContain("only works while Adam Whitfield hasn't started the redo");
    expect(text).not.toContain("—");
    expect(button(container, "Undo the redo")).toBeUndefined();
    expect(undo).not.toHaveBeenCalled();
  });

  it("does not promise to lift a cap that is not there", () => {
    const { container } = undoRedo(false);
    fireEvent.click(button(container, "Undo the redo")!);
    expect(container.textContent).not.toContain("cap");
  });

  it("undoes this submission on the second press", async () => {
    const { container } = undoRedo();
    fireEvent.click(button(container, "Undo the redo")!);
    fireEvent.click(button(container, "Yes, undo the redo")!);
    await vi.waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(undo.mock.calls[0][0]).toBe("s1");
  });

  it("goes back to the single button on Cancel, without undoing", () => {
    const { container } = undoRedo();
    fireEvent.click(button(container, "Undo the redo")!);
    fireEvent.click(button(container, "Cancel")!);
    expect(button(container, "Undo the redo")).toBeTruthy();
    expect(undo).not.toHaveBeenCalled();
  });

  it("shows the refusal inline and keeps the confirm open", async () => {
    undo.mockResolvedValue({
      error: "Adam Whitfield has already started the redo, so it can't be undone.",
    });
    const { container } = undoRedo();
    fireEvent.click(button(container, "Undo the redo")!);
    fireEvent.click(button(container, "Yes, undo the redo")!);

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).toBeTruthy());
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      "Adam Whitfield has already started the redo, so it can't be undone.",
    );
    expect(button(container, "Yes, undo the redo")).toBeTruthy();
  });

  it("puts a thrown action in plain words rather than failing silently", async () => {
    undo.mockRejectedValue(new Error("An unexpected response was received from the server."));
    const { container } = undoRedo();
    fireEvent.click(button(container, "Undo the redo")!);
    fireEvent.click(button(container, "Yes, undo the redo")!);

    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).toBeTruthy());
    expect(container.querySelector('[role="alert"]')!.textContent).toBe(
      "Could not undo the redo. Reload the page and try again.",
    );
  });

  it("clears the error when the teacher cancels", async () => {
    undo.mockResolvedValue({ error: "Something went wrong." });
    const { container } = undoRedo();
    fireEvent.click(button(container, "Undo the redo")!);
    fireEvent.click(button(container, "Yes, undo the redo")!);
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')).toBeTruthy());

    fireEvent.click(button(container, "Cancel")!);
    fireEvent.click(button(container, "Undo the redo")!);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
