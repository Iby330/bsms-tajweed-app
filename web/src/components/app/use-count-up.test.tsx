// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useCountUp } from "./use-count-up";

/** jsdom's matchMedia always reports false — stub it to claim the opposite. */
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function Probe({ target }: { target: number | null }) {
  const value = useCountUp(target, 40);
  return <span>{value === null ? "—" : value.toFixed(0)}</span>;
}

// This suite has no global testing-library cleanup, so every query is scoped
// to its own container — the pattern the rest of the component tests follow.
afterEach(() => vi.unstubAllGlobals());

describe("useCountUp", () => {
  it("lands on the target", async () => {
    stubReducedMotion(false);
    const { container } = render(<Probe target={84} />);
    await waitFor(() => expect(container.textContent).toBe("84"));
  });

  it("skips straight to the target when motion is unwelcome", async () => {
    stubReducedMotion(true);
    const { container } = render(<Probe target={84} />);
    await waitFor(() => expect(container.textContent).toBe("84"));
  });

  it("passes a missing value through instead of counting up to zero", () => {
    stubReducedMotion(false);
    const { container } = render(<Probe target={null} />);
    expect(container.textContent).toBe("—");
  });
});
