// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AppShell } from "./shell";
import type { NavItem } from "@/lib/nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/teacher/home",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabaseBrowser: () => ({ auth: { signOut: vi.fn() } }),
}));

const nav: NavItem[] = [
  { href: "/teacher/home", label: "Home", icon: "home", tab: true },
  { href: "/teacher/roster", label: "Roster", icon: "users", tab: true },
];

/** Neither bar has a height in jsdom, so the measurement is stubbed on the
 *  one property the effect reads. */
function stubHeights(heights: Record<string, number>) {
  const spy = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get");
  spy.mockImplementation(function (this: HTMLElement) {
    for (const [cls, h] of Object.entries(heights)) {
      if (this.classList.contains(cls)) return h;
    }
    return 0;
  });
  return spy;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppShell chrome measurements", () => {
  it("writes the phone bars' heights onto the shell root", () => {
    stubHeights({ topbar: 70, tabs: 56 });
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(_cb: () => void) {}
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {}
      },
    );

    const { container } = render(
      <AppShell
        nav={nav}
        mobileNav={{ tabs: nav, more: [] }}
        userName="Umm Salamah"
        roleLabel="Teacher"
      >
        <p>content</p>
      </AppShell>,
    );

    const root = container.querySelector<HTMLElement>(".appshell")!;
    expect(root.style.getPropertyValue("--chrome-top")).toBe("70px");
    expect(root.style.getPropertyValue("--chrome-bottom")).toBe("56px");
    // Both bars are watched: the top bar can grow, and the tab bar's height
    // moves with the safe area.
    expect(observed.map((el) => el.className)).toEqual(["topbar", "tabs"]);
  });
});
