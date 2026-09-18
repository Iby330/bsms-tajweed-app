import { describe, it, expect } from "vitest";
import {
  MAX_TABS, mobileNavFor, studentMobileNav, teacherMobileNav, teacherNav,
} from "./nav";

/**
 * The bar only has room for five cells, and everything that does not fit has
 * to be reachable some other way. Before the More tab, five teacher pages
 * (curriculum, calendar, classes, applications, deposits) had no phone route
 * to them at all — no link anywhere in the app. These tests are here so that
 * cannot come back the next time an item joins the nav.
 */
describe("mobileNavFor", () => {
  it("leaves no live teacher page unreachable on a phone", () => {
    const reachable = new Set(
      [...teacherMobileNav.tabs, ...teacherMobileNav.more].map((i) => i.href),
    );
    for (const item of teacherNav.filter((i) => !i.comingSoon)) {
      expect(reachable.has(item.href), item.href).toBe(true);
    }
  });

  it("never asks the bar for more cells than it has", () => {
    expect(teacherMobileNav.tabs.length).toBeLessThanOrEqual(MAX_TABS);
    expect(studentMobileNav.tabs.length).toBeLessThanOrEqual(MAX_TABS);
  });

  it("saves a cell for More whenever there is a More to open", () => {
    expect(teacherMobileNav.more.length).toBeGreaterThan(0);
    expect(teacherMobileNav.tabs.length).toBeLessThanOrEqual(MAX_TABS - 1);
  });

  it("gives students all five cells, because nothing is left over", () => {
    expect(studentMobileNav.more).toEqual([]);
    expect(studentMobileNav.tabs.length).toBe(5);
  });

  it("keeps coming-soon items out of the bar", () => {
    const soon = [...studentMobileNav.tabs, ...teacherMobileNav.tabs]
      .filter((i) => i.comingSoon);
    expect(soon).toEqual([]);
  });

  it("puts the live items above the coming-soon ones under More", () => {
    const flags = teacherMobileNav.more.map((i) => Boolean(i.comingSoon));
    expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
    expect(flags).toContain(true);
  });

  it("does not spend a cell on More when only unreachable extras are left", () => {
    // A nav whose only un-pinned item is coming soon has nothing worth
    // opening a sheet for, so the pinned items keep the whole bar.
    const nav = mobileNavFor([
      { href: "/a", label: "A", icon: "home", tab: true },
      { href: "/b", label: "B", icon: "book", tab: true },
      { href: "/soon", label: "Soon", icon: "bell", comingSoon: true },
    ]);
    expect(nav.more).toEqual([]);
    expect(nav.tabs.length).toBe(2);
  });
});
