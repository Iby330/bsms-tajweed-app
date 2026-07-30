import {
  Home, PlaySquare, ClipboardList, BookOpenCheck, User, Library, Landmark,
  Bell, CheckSquare, Users, GraduationCap, Settings2,
} from "lucide-react";
import type { NavItem } from "@/components/app/shell";

export const studentNav: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/lessons", label: "Lessons", icon: PlaySquare },
  { href: "/homework", label: "Homework", icon: ClipboardList },
  { href: "/hifz", label: "Hifz", icon: BookOpenCheck },
  { href: "/me", label: "Me", icon: User },
  { href: "/coming-soon/resources", label: "Resources", icon: Library, comingSoon: true },
  { href: "/coming-soon/seerah", label: "Seerah", icon: Landmark, comingSoon: true },
  { href: "/coming-soon/notifications", label: "Notifications", icon: Bell, comingSoon: true },
];
export const studentMobileNav: NavItem[] = studentNav.slice(0, 5);

export const teacherNav: NavItem[] = [
  { href: "/teacher/home", label: "Home", icon: Home },
  { href: "/teacher/review", label: "Review", icon: CheckSquare },
  { href: "/teacher/roster", label: "Roster", icon: Users },
  { href: "/teacher/hifz", label: "Hifz", icon: BookOpenCheck },
  { href: "/teacher/classes", label: "Classes", icon: GraduationCap },
  { href: "/coming-soon/curriculum", label: "Curriculum", icon: Settings2, comingSoon: true },
  { href: "/coming-soon/notifications", label: "Notifications", icon: Bell, comingSoon: true },
];
export const teacherMobileNav: NavItem[] = teacherNav.slice(0, 5);
