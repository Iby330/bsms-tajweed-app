// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { MoreTab } from "./more-sheet";
import type { NavItem } from "@/lib/nav";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/teacher/home" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

// Dialog renders are slow under full-suite worker contention: the default
// 5s timeout flakes even though every interaction completes.
const SLOW = 20_000;

const items: NavItem[] = [
  { href: "/teacher/curriculum", label: "Curriculum", icon: "video" },
  { href: "/teacher/deposits", label: "Deposits", icon: "wallet" },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];

// The sheet portals into document.body, so `screen` is the only way to see it,
// and with no global setup file there is no auto-cleanup.
afterEach(() => {
  cleanup();
  pathname.value = "/teacher/home";
});

const trigger = () => screen.getByRole("button", { name: /More/ });

describe("MoreTab", () => {
  it("opens onto a link for every item it was handed", () => {
    render(<MoreTab items={items} userName="Umm Salamah" />);
    fireEvent.click(trigger());
    for (const item of items) {
      const link = screen.getByRole("link", { name: new RegExp(item.label) });
      expect(link.getAttribute("href")).toBe(item.href);
    }
  }, SLOW);

  it("offers the account page the topbar user icon would reach", () => {
    render(<MoreTab items={items} userName="Umm Salamah" />);
    fireEvent.click(trigger());
    const me = screen.getByRole("link", { name: /Umm Salamah/ });
    expect(me.getAttribute("href")).toBe("/account");
  }, SLOW);

  it("lights up while one of its own pages is open", () => {
    pathname.value = "/teacher/deposits";
    render(<MoreTab items={items} userName="Umm Salamah" />);
    expect(trigger().hasAttribute("data-active")).toBe(true);
  }, SLOW);

  it("stays dim while a page in the bar itself is open", () => {
    pathname.value = "/teacher/home";
    render(<MoreTab items={items} userName="Umm Salamah" />);
    expect(trigger().hasAttribute("data-active")).toBe(false);
  }, SLOW);

  it("counts a page nested under a More item as that item", () => {
    pathname.value = "/teacher/curriculum/lesson/4";
    render(<MoreTab items={items} userName="Umm Salamah" />);
    expect(trigger().hasAttribute("data-active")).toBe(true);
  }, SLOW);
});
