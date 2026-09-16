// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePageInView } from "./use-page-in-view";

type Entry = { target: Element; intersectionRatio: number };

/** A fake IntersectionObserver that records what it's asked to observe and
 *  lets the test fire ratio updates on demand. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: (entries: Entry[]) => void;
  observed: Element[] = [];
  disconnected = false;
  constructor(callback: (entries: Entry[]) => void) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((o) => o !== el);
  }
  disconnect() {
    this.disconnected = true;
  }
  /** Fire a batch of ratio updates for the currently observed elements,
   *  keyed by page number. */
  trigger(ratios: Record<number, number>) {
    const entries: Entry[] = this.observed.map((el) => ({
      target: el,
      intersectionRatio: ratios[Number(el.id.replace("page-", ""))] ?? 0,
    }));
    this.callback(entries);
  }
}

/** A root element with `page-N` sections inside it, the way the logger's
 *  wrapper div and MushafReader's sections nest in the real DOM. */
function buildRoot(pageNumbers: number[]): HTMLDivElement {
  const root = document.createElement("div");
  for (const n of pageNumbers) {
    const section = document.createElement("section");
    section.id = `page-${n}`;
    root.appendChild(section);
  }
  document.body.appendChild(root);
  return root;
}

const originalIO = globalThis.IntersectionObserver;

afterEach(() => {
  FakeIntersectionObserver.instances = [];
  if (originalIO) {
    globalThis.IntersectionObserver = originalIO;
  } else {
    // @ts-expect-error restoring the "does not exist" baseline
    delete globalThis.IntersectionObserver;
  }
  document.body.innerHTML = "";
});

describe("usePageInView", () => {
  it("reports the page with the highest intersection ratio", () => {
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const root = buildRoot([1, 2, 3]);
    const rootRef = { current: root };

    const { result } = renderHook(() => usePageInView(rootRef, [1, 2, 3]));
    const io = FakeIntersectionObserver.instances[0];

    act(() => io.trigger({ 1: 0.2, 2: 0.7, 3: 0.1 }));
    expect(result.current).toBe(2);

    act(() => io.trigger({ 2: 0, 3: 0.4 }));
    expect(result.current).toBe(3);
  });

  it("disconnects the observer on unmount", () => {
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const root = buildRoot([1]);
    const rootRef = { current: root };

    const { unmount } = renderHook(() => usePageInView(rootRef, [1]));
    const io = FakeIntersectionObserver.instances[0];
    unmount();

    expect(io.disconnected).toBe(true);
  });

  it("stays null where IntersectionObserver does not exist", () => {
    // @ts-expect-error deliberately unsetting it for this case
    delete globalThis.IntersectionObserver;
    const root = buildRoot([1]);
    const rootRef = { current: root };

    const { result } = renderHook(() => usePageInView(rootRef, [1]));

    expect(result.current).toBeNull();
  });
});
