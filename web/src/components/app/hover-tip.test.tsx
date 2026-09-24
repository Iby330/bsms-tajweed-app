// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { HoverTip } from "./hover-tip";

/** jsdom's matchMedia always reports false. Stub it to claim the opposite. */
function stubHoverNone(none: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("hover: none") ? none : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  // The scroll path repositions in a frame; run it straight away.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
}

function setup() {
  const view = render(
    <>
      <HoverTip />
      <span data-tip="Hello">x</span>
      <button data-tip="No">b</button>
      <div>outside</div>
    </>,
  );
  const tip = view.container.querySelector("#hovertip") as HTMLElement;
  return {
    tip,
    span: view.getByText("x"),
    button: view.getByText("b"),
    outside: view.getByText("outside"),
  };
}

const shown = (tip: HTMLElement) => tip.classList.contains("on");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HoverTip on a touch screen", () => {
  it("shows the tip on a tap and hides it on a second tap", () => {
    stubHoverNone(true);
    const { tip, span } = setup();

    fireEvent.click(span);
    expect(shown(tip)).toBe(true);
    expect(tip.textContent).toContain("Hello");

    fireEvent.click(span);
    expect(shown(tip)).toBe(false);
  });

  it("keeps a tapped tip through a scroll", () => {
    stubHoverNone(true);
    const { tip, span } = setup();

    fireEvent.click(span);
    fireEvent.scroll(window);
    expect(shown(tip)).toBe(true);
  });

  it("hides when the tap lands elsewhere", () => {
    stubHoverNone(true);
    const { tip, span, outside } = setup();

    fireEvent.click(span);
    fireEvent.click(outside);
    expect(shown(tip)).toBe(false);
  });

  it("leaves a button carrier alone, since the tap already does something", () => {
    stubHoverNone(true);
    const { tip, button } = setup();

    fireEvent.click(button);
    expect(shown(tip)).toBe(false);
  });

  it("hides on Escape", () => {
    stubHoverNone(true);
    const { tip, span } = setup();

    fireEvent.click(span);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(shown(tip)).toBe(false);
  });

  it("ignores the synthetic mouseover a tap fires", () => {
    stubHoverNone(true);
    const { tip, span } = setup();

    fireEvent.mouseOver(span);
    expect(shown(tip)).toBe(false);
  });
});

describe("HoverTip with a mouse", () => {
  it("still shows on hover and hides on leave", () => {
    stubHoverNone(false);
    const { tip, span } = setup();

    fireEvent.mouseOver(span);
    expect(shown(tip)).toBe(true);
    expect(tip.textContent).toContain("Hello");

    fireEvent.mouseOut(span);
    expect(shown(tip)).toBe(false);
  });

  it("does not latch on a click, so the next scroll still hides it", () => {
    stubHoverNone(false);
    const { tip, span } = setup();

    fireEvent.mouseOver(span);
    fireEvent.click(span);
    expect(shown(tip)).toBe(true);

    fireEvent.scroll(window);
    expect(shown(tip)).toBe(false);
  });
});
