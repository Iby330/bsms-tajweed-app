"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Moon, Sun, Home, PlaySquare, ClipboardList, BookOpenCheck, User, Library,
  Landmark, Bell, CheckSquare, Users, GraduationCap, Settings2, CalendarDays,
  LogOut, type LucideIcon,
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
 * AppShell — the two deliberate layouts (plan: Q14, not just reflow):
 *  · desktop ≥1024px: fixed ink sidebar (240px), content on --page
 *  · mobile: top app bar + bottom tab bar (5 tabs)
 * Nav config is passed in by the (student)/(teacher) group layouts.
 */

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className={cn("size-9", className)} />;
  const dark = resolvedTheme === "dark";
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md transition-colors",
        "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground",
        className,
      )}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
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
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md transition-colors disabled:opacity-50",
        "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground",
        className,
      )}
    >
      <LogOut className="size-4" />
    </button>
  );
}

function NavLink({
  item,
  active,
  variant,
}: {
  item: NavItem;
  active: boolean;
  variant: "sidebar" | "tab";
}) {
  const Icon = ICONS[item.icon];
  if (variant === "sidebar") {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.comingSoon && (
          <span className="ml-auto rounded-sm bg-sidebar-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
            soon
          </span>
        )}
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
        active ? "text-foreground font-medium" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({
  nav,
  mobileNav,
  userName,
  roleLabel,
  glass = false,
  children,
}: {
  nav: NavItem[];
  /** exactly 5 items for the bottom tab bar */
  mobileNav: NavItem[];
  userName: string;
  roleLabel: string;
  /** Student chrome floats on glass; teacher chrome stays solid. */
  glass?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  return (
    <div className="flex min-h-dvh w-full">
      {/* desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col text-sidebar-foreground lg:flex",
          glass ? "glass border-y-0 border-l-0 bg-sidebar/70 backdrop-blur-2xl" : "bg-sidebar",
        )}
      >
        <div className="flex items-center gap-3 px-5 pt-6 pb-4">
          <Image
            src="/brand/logo.png"
            alt="BSMS Tajweed"
            width={36}
            height={36}
            className="rounded-md"
            priority
          />
          <div className="leading-tight">
            <div className="font-heading text-sm font-bold tracking-tight">
              BSMS TAJWEED
            </div>
            <div className="text-[11px] text-sidebar-foreground/60">{roleLabel}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              variant="sidebar"
            />
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3">
          <span className="min-w-0 truncate text-xs text-sidebar-foreground/70">{userName}</span>
          <div className="flex shrink-0 items-center">
            <ThemeToggle />
            <SignOutIcon />
          </div>
        </div>
      </aside>

      {/* mobile top bar */}
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden",
          glass ? "glass rounded-none border-x-0 border-t-0" : "border-b border-line bg-card",
        )}
      >
        <div className="flex items-center gap-2.5">
          <Image
            src="/brand/logo.png"
            alt="BSMS Tajweed"
            width={28}
            height={28}
            className="rounded"
            priority
          />
          <span className="font-heading text-sm font-bold tracking-tight">
            BSMS TAJWEED
          </span>
        </div>
        <div className="flex items-center">
          <ThemeToggle className="text-foreground/70 hover:bg-muted hover:text-foreground" />
          <SignOutIcon className="text-foreground/70 hover:bg-muted hover:text-foreground" />
        </div>
      </header>

      {/* content */}
      <main className="flex-1 pt-14 pb-20 lg:ml-60 lg:pt-0 lg:pb-0">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-6 lg:px-8 lg:py-10">
          {children}
        </div>
      </main>

      {/* mobile bottom tabs */}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 flex pb-[env(safe-area-inset-bottom)] lg:hidden",
          glass ? "glass rounded-none border-x-0 border-b-0" : "border-t border-line bg-card",
        )}
      >
        {mobileNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            variant="tab"
          />
        ))}
      </nav>
    </div>
  );
}
