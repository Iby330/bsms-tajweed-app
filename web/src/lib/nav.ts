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
  { href: "/courses", label: "Courses", icon: "video" },
  { href: "/progress", label: "Progress", icon: "clipboard" },
  { href: "/hifz", label: "Hifz", icon: "book" },
  { href: "/coming-soon/resources", label: "Resources", icon: "library", comingSoon: true },
  { href: "/coming-soon/seerah", label: "Seerah", icon: "landmark", comingSoon: true },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];
export const studentMobileNav: NavItem[] = studentNav.slice(0, 4);

// Attendance sits inside the first five deliberately: the register is taken on
// a phone, in the room, and the mobile tab bar only shows five.
export const teacherNav: NavItem[] = [
  { href: "/teacher/home", label: "Home", icon: "home" },
  { href: "/teacher/homework", label: "Homework", icon: "check" },
  { href: "/teacher/attendance", label: "Register", icon: "calendar" },
  { href: "/teacher/roster", label: "Roster", icon: "users" },
  { href: "/teacher/hifz", label: "Hifz", icon: "book" },
  { href: "/teacher/classes", label: "Classes", icon: "graduation" },
  { href: "/teacher/curriculum", label: "Curriculum", icon: "settings" },
  { href: "/coming-soon/notifications", label: "Notifications", icon: "bell", comingSoon: true },
];
export const teacherMobileNav: NavItem[] = teacherNav.slice(0, 5);
