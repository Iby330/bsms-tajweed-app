/**
 * Nav config. `icon` is a STRING key, never a component — this config crosses
 * the server→client boundary into <AppShell>, and React cannot serialize
 * functions across it. The client resolves names to Lucide components.
 */
export type IconName =
  | "home" | "video" | "clipboard" | "book" | "user"
  | "library" | "landmark" | "bell" | "check" | "users"
  | "graduation" | "settings" | "calendar" | "calendar-range" | "wallet"
  | "user-plus" | "more";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  comingSoon?: boolean;
  /** pinned to the phone tab bar; everything else lives under More */
  tab?: true;
};

/** What the phone bar shows, and what the More sheet holds. */
export type MobileNav = { tabs: NavItem[]; more: NavItem[] };

/** Cells across the bottom of a phone. Five is what fits at 360px. */
export const MAX_TABS = 5;

/**
 * Split a nav into the bar and the sheet.
 *
 * The rule the app used to follow was `slice(0, 5)`, which quietly stranded
 * everything after the fifth item: on a phone there was no link to it at all.
 * Now the tab bar is chosen (`tab: true`) rather than taken off the top, and
 * whatever is left goes under More, which costs a cell, so it only appears
 * when there is something live to put in it.
 */
export function mobileNavFor(nav: NavItem[]): MobileNav {
  const pinned = nav.filter((n) => n.tab);
  const rest = nav.filter((n) => !n.tab);
  // Coming-soon items alone are not worth a cell: the sheet would open onto
  // nothing anyone can use yet.
  if (!rest.some((n) => !n.comingSoon)) {
    return { tabs: pinned.slice(0, MAX_TABS), more: [] };
  }
  return {
    tabs: pinned.slice(0, MAX_TABS - 1),
    more: [...rest.filter((n) => !n.comingSoon), ...rest.filter((n) => n.comingSoon)],
  };
}

// The five live items are all pinned: they fit exactly, so students get no
// More tab. The calendar earns its place because "when is my next class" is
// asked on a phone more than anywhere else.
export const studentNav: NavItem[] = [
  { href: "/home", label: "Home", icon: "home", tab: true },
  { href: "/courses", label: "Courses", icon: "video", tab: true },
  { href: "/progress", label: "Progress", icon: "clipboard", tab: true },
  { href: "/hifz", label: "Hifdh", icon: "book", tab: true },
  { href: "/calendar", label: "Calendar", icon: "calendar", tab: true },
  { href: "/coming-soon/resources", label: "Resources", icon: "library", comingSoon: true },
  { href: "/coming-soon/seerah", label: "Seerah", icon: "landmark", comingSoon: true },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];
export const studentMobileNav: MobileNav = mobileNavFor(studentNav);

// `tab: true` marks the four that hold a phone cell; the More sheet reaches
// the rest. Order here is the rail's order, which is not the bar's: the bar
// is whatever is pinned, in this order, and the sheet is the remainder.
export const teacherNav: NavItem[] = [
  { href: "/teacher/home", label: "Home", icon: "home", tab: true },
  { href: "/teacher/homework", label: "Homework", icon: "check" },
  // The register is taken on a phone, in the room, which is why it is pinned
  // and homework above it is not.
  { href: "/teacher/attendance", label: "Register", icon: "calendar", tab: true },
  { href: "/teacher/roster", label: "My students", icon: "users", tab: true },
  { href: "/teacher/hifz", label: "Hifdh", icon: "book", tab: true },
  // Curriculum came off the rail when it was setup work — attach a lesson
  // video, check a rubric, done once for the year. It is the teaching side of
  // the courses now: the grid a class sees, each lesson playing in the app, and
  // a homework's results read three ways. That is opened weekly, so it is back.
  { href: "/teacher/curriculum", label: "Curriculum", icon: "video" },
  // The year, not the register: this one is the term dates and the breaks,
  // which is a different question from "who is in the room today".
  { href: "/teacher/calendar", label: "Calendar", icon: "calendar-range" },
  { href: "/teacher/classes", label: "Classes", icon: "graduation" },
  // Unpinned on purpose: the intake is worked through in a sitting or two each
  // September, not weekly, and it should not cost the register or the roster
  // their cell for the other eleven months.
  { href: "/teacher/applications", label: "Applications", icon: "user-plus" },
  { href: "/teacher/deposits", label: "Deposits", icon: "wallet" },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];
export const teacherMobileNav: MobileNav = mobileNavFor(teacherNav);
