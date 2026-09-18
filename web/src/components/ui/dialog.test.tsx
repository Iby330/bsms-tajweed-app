// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Dialog, DialogContent } from "./dialog";

// Base UI portals the popup into document.body, and there is no global setup
// file, so without this every test also sees the dialogs left behind above.
afterEach(cleanup);

function contentClass(): string {
  const el = document.querySelector('[data-slot="dialog-content"]');
  expect(el).not.toBeNull();
  return el!.className;
}

describe("DialogContent on phones", () => {
  it("is a scrollable, height-capped sheet", () => {
    render(
      <Dialog open>
        <DialogContent>x</DialogContent>
      </Dialog>
    );
    const cls = contentClass();
    expect(cls).toContain("overflow-y-auto");
    expect(cls).toMatch(/(^|\s)(sm:)?max-h-/);
  });

  it("only translates from sm up, so the sheet is not shoved off-screen", () => {
    render(
      <Dialog open>
        <DialogContent>x</DialogContent>
      </Dialog>
    );
    const cls = contentClass();
    expect(cls).toContain("sm:-translate-x-1/2");
    expect(cls).not.toMatch(/(^|\s)-translate-x-1\/2/);
    expect(cls).not.toMatch(/(^|\s)-translate-y-1\/2/);
  });

  it("drops the max-w-[calc] gutter that tailwind-merge used to strip", () => {
    render(
      <Dialog open>
        <DialogContent>x</DialogContent>
      </Dialog>
    );
    expect(contentClass()).not.toContain("max-w-[calc");
  });
});
