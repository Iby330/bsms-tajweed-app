// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Dialog, DialogContent } from "./dialog";

// Base UI portals the popup into document.body, and there is no global setup
// file, so without this every test also sees the dialogs left behind above.
afterEach(cleanup);

function frame(): HTMLElement {
  const el = document.querySelector('[data-slot="dialog-content"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function body(): HTMLElement {
  const el = document.querySelector('[data-slot="dialog-body"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function open(props: Record<string, unknown> = {}) {
  render(
    <Dialog open>
      <DialogContent {...props}>x</DialogContent>
    </Dialog>
  );
}

describe("DialogContent on phones", () => {
  it("scrolls the body, not the frame", () => {
    open();
    expect(body().className).toContain("overflow-y-auto");
    expect(body().className).toContain("overscroll-contain");
    // The frame must stay put: if it scrolled, the close button pinned to it
    // would scroll out of sight on a tall sheet.
    expect(frame().className).not.toContain("overflow-y-auto");
  });

  it("caps the frame's height", () => {
    open();
    expect(frame().className).toMatch(/(^|\s)(sm:)?max-h-/);
  });

  it("pads the body clear of the home indicator", () => {
    open();
    expect(body().className).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });

  it("only translates from sm up, so the sheet is not shoved off-screen", () => {
    open();
    const cls = frame().className;
    expect(cls).toContain("sm:-translate-x-1/2");
    expect(cls).not.toMatch(/(^|\s)-translate-x-1\/2/);
    expect(cls).not.toMatch(/(^|\s)-translate-y-1\/2/);
  });

  it("drops the max-w-[calc] gutter that tailwind-merge used to strip", () => {
    open();
    expect(frame().className).not.toContain("max-w-[calc");
  });
});

describe("DialogContent class routing", () => {
  it("hangs the close button off the frame, not the scrolling body", () => {
    open();
    const close = document.querySelector('[data-slot="dialog-close"]');
    expect(close).not.toBeNull();
    expect(close!.parentElement).toBe(frame());
    expect(body().contains(close!)).toBe(false);
    expect(close!.className).toContain("absolute");
    expect(close!.className).toContain("z-10");
  });

  it("puts className on the body and frameClassName on the frame", () => {
    open({ className: "space-y-3", frameClassName: "sm:max-w-md" });
    expect(body().className).toContain("space-y-3");
    expect(frame().className).toContain("sm:max-w-md");
    expect(frame().className).not.toContain("space-y-3");
  });
});
