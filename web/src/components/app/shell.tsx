"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Moon, Sun, Home, PlaySquare, ClipboardList, BookOpenCheck, User, Library,
  Landmark, Bell, CheckSquare, Users, GraduationCap, Settings2, CalendarDays,
  LogOut, PanelLeftClose, type LucideIcon,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { NavItem, IconName } from "@/lib/nav";

/** Names → components. The nav config crosses the RSC boundary as plain
 *  data, so the mapping has to happen here on the client. */
const ICONS: Record<IconName, LucideIcon> = {
  home: Home, video: PlaySquare, clipboard: ClipboardList, book: BookOpenCheck,
  user: User, library: Library, landmark: Landmark, bell: Bell,
  check: CheckSquare, users: Users, graduation: GraduationCap,
  settings: Settings2, calendar: CalendarDays,
};

/**
 * AppShell — 2026 identity.
 *
 *  · desktop ≥1024px: a near-black rail, collapsible to icons
 *  · mobile: black top bar + bottom tab bar
 *
 * The rail is near-black in BOTH themes on purpose: the mark is cream, and
 * this keeps it in the environment the logo was drawn for rather than
 * inverting it on light pages.
 */

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={cn("railbtn opacity-0", className)} />;
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("railbtn", className)}
    >
      {dark ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
    </button>
  );
}

/** Sign out from anywhere. Lives in the shell because teachers have no
 *  profile page to hide it on. */
function SignOutIcon({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="Sign out"
      title="Sign out"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await supabaseBrowser().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className={cn("railbtn disabled:opacity-50", className)}
    >
      <LogOut className="size-[15px]" />
    </button>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({
  nav,
  mobileNav,
  userName,
  roleLabel,
  backdrop,
  children,
}: {
  nav: NavItem[];
  /** the first items only — the bottom tab bar has room for five */
  mobileNav: NavItem[];
  userName: string;
  roleLabel: string;
  /** the class's place, painted behind the content area */
  backdrop?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  // Collapsed state is read after mount, not during render: reading
  // localStorage on the server would desync the first paint.
  const [railOff, setRailOff] = useState(false);
  useEffect(() => {
    try {
      setRailOff(localStorage.getItem("bsms-rail") === "off");
    } catch {}
  }, []);
  const toggleRail = () => {
    setRailOff((v) => {
      try {
        localStorage.setItem("bsms-rail", v ? "on" : "off");
      } catch {}
      return !v;
    });
  };

  // "Coming soon" entries are grouped under their own heading rather than
  // left to look like broken links among the live ones.
  const live = nav.filter((n) => !n.comingSoon);
  const soon = nav.filter((n) => n.comingSoon);

  const railLink = (item: NavItem) => {
    const Icon = ICONS[item.icon];
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        aria-current={isActive(item.href) ? "page" : undefined}
        className={item.comingSoon ? "soon" : undefined}
      >
        <Icon className="size-[17px] shrink-0" />
        <span className="lb">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="appshell" data-rail={railOff ? "off" : "on"}>
      <aside className="rail">
        <div className="head">
          <span className="mark" role="img" aria-label="BSMS Tajweed" />
          <button
            type="button"
            onClick={toggleRail}
            aria-expanded={!railOff}
            aria-label={railOff ? "Expand sidebar" : "Collapse sidebar"}
            className="railbtn toggle"
          >
            <PanelLeftClose className="size-[15px]" />
          </button>
        </div>

        <nav>
          {live.map(railLink)}
          {soon.length > 0 && <div className="grp">Coming soon</div>}
          {soon.map(railLink)}
        </nav>

        <div className="foot">
          <span className="me">
            <i aria-hidden>{initialsOf(userName)}</i>
            <span title={`${userName} · ${roleLabel}`}>{userName}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <SignOutIcon />
          </span>
        </div>
      </aside>

      <div className="shellmain">
        {backdrop}
        <header className="topbar">
          <span className="mark" role="img" aria-label="BSMS Tajweed" />
          <span className="flex items-center gap-1.5">
            <ThemeToggle />
            <SignOutIcon />
          </span>
        </header>

        <main className="shellview">{children}</main>

        <nav className="tabs">
          {mobileNav.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                <Icon className="size-[19px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
