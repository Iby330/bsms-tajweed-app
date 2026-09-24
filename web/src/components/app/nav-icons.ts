import {
  Home, PlaySquare, ClipboardList, BookOpenCheck, User, Library,
  Landmark, Bell, CheckSquare, Users, GraduationCap, Settings2, CalendarDays,
  CalendarRange, Wallet, UserPlus, type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

/**
 * Names → components. The nav config crosses the RSC boundary as plain data,
 * so the mapping has to happen on the client.
 *
 * It sits in its own module because both the shell and the More sheet draw
 * nav items, and the shell already imports the sheet: putting the map in
 * either one would make them import each other.
 */
export const ICONS: Record<IconName, LucideIcon> = {
  home: Home, video: PlaySquare, clipboard: ClipboardList, book: BookOpenCheck,
  user: User, library: Library, landmark: Landmark, bell: Bell,
  check: CheckSquare, users: Users, graduation: GraduationCap,
  settings: Settings2, calendar: CalendarDays, "calendar-range": CalendarRange,
  wallet: Wallet, "user-plus": UserPlus,
};
