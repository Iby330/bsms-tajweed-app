// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Result } from "@/lib/exam-builder/types";
import { PaperNameField } from "./paper-name-field";

afterEach(cleanup);

const field = () => screen.getByRole("textbox", { name: "Paper name" }) as HTMLInputElement;

function type(value: string) {
  const el = field();
  el.focus();
  fireEvent.change(el, { target: { value } });
  return el;
}

describe("PaperNameField", () => {
  it("shows the placeholder when unnamed and caps the length at 60", () => {
    render(<PaperNameField name="" onSave={vi.fn()} />);
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("Untitled paper");
    expect(field().maxLength).toBe(60);
  });

  it("saves the trimmed name on Enter", async () => {
    const onSave = vi.fn(async (): Promise<Result> => ({ ok: true }));
    render(<PaperNameField name="" onSave={onSave} />);
    const el = type("  Advanced ");
    await act(async () => { fireEvent.keyDown(el, { key: "Enter" }); el.blur(); });
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Advanced");
    expect(field().value).toBe("Advanced");
  });

  it("saves on blur, and not at all when the trimmed name is unchanged", async () => {
    const onSave = vi.fn(async (): Promise<Result> => ({ ok: true }));
    render(<PaperNameField name="Advanced" onSave={onSave} />);
    let el = type("Advanced  ");
    await act(async () => { fireEvent.blur(el); });
    expect(onSave).not.toHaveBeenCalled();
    expect(field().value).toBe("Advanced");

    el = type("Lower");
    await act(async () => { fireEvent.blur(el); });
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Lower");
  });

  it("Escape puts the saved name back without saving", async () => {
    const onSave = vi.fn(async (): Promise<Result> => ({ ok: true }));
    render(<PaperNameField name="Advanced" onSave={onSave} />);
    const el = type("Lower");
    await act(async () => { fireEvent.keyDown(el, { key: "Escape" }); el.blur(); });
    expect(onSave).not.toHaveBeenCalled();
    expect(field().value).toBe("Advanced");
  });

  it("puts the old name back and shows the server's refusal", async () => {
    const onSave = vi.fn(async (): Promise<Result> => ({ ok: false, error: "You can only change your own papers." }));
    render(<PaperNameField name="Advanced" onSave={onSave} />);
    const el = type("Lower");
    await act(async () => { fireEvent.blur(el); });
    expect(field().value).toBe("Advanced");
    expect(screen.getByRole("alert").textContent).toBe("You can only change your own papers.");
  });
});
