/**
 * Nav config. `icon` is a STRING key, never a component — this config crosses
 * the server→client boundary into <AppShell>, and React cannot serialize
 * functions across it. The client resolves names to Lucide components.
 */
export type IconName =
  | "home" | "video" | "clipboard" | "book" | "user"
  | "library" | "landmark" | "bell" | "check" | "users"
  | "graduation" | "settings" | "calendar";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  comingSoon?: boolean;
};

export const studentNav: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/lessons", label: "Lessons", icon: "video" },
  { href: "/homework", label: "Homework", icon: "clipboard" },
  { href: "/hifz", label: "Hifz", icon: "book" },
  { href: "/me", label: "Me", icon: "user" },
  { href: "/coming-soon/resources", label: "Resources", icon: "library", comingSoon: true },
  { href: "/coming-soon/seerah", label: "Seerah", icon: "landmark", comingSoon: true },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];
export const studentMobileNav: NavItem[] = studentNav.slice(0, 5);

export const teacherNav: NavItem[] = [
  { href: "/teacher/home", label: "Home", icon: "home" },
  { href: "/teacher/review", label: "Review", icon: "check" },
  { href: "/teacher/roster", label: "Roster", icon: "users" },
  { href: "/teacher/hifz", label: "Hifz", icon: "book" },
  { href: "/teacher/classes", label: "Classes", icon: "graduation" },
  { href: "/coming-soon/curriculum", label: "Curriculum", icon: "settings", comingSoon: true },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];
export const teacherMobileNav: NavItem[] = teacherNav.slice(0, 5);
