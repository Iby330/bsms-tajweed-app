"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, User, LogOut, PanelLeftClose } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ICONS } from "./nav-icons";
import { MoreTab, initialsOf } from "./more-sheet";
import type { NavItem, MobileNav } from "@/lib/nav";

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

export function AppShell({
  nav,
  mobileNav,
  userName,
  roleLabel,
  avatarSrc,
  backdrop,
  children,
}: {
  nav: NavItem[];
  /** the five phone cells, and whatever the More sheet has to carry */
  mobileNav: MobileNav;
  userName: string;
  roleLabel: string;
  /** signed URL for their picture, or null — initials stand in when absent */
  avatarSrc?: string | null;
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

  // The phone's chrome, measured rather than assumed. The values feed sticky
  // offsets and scroll margins on phones, where the top bar would otherwise
  // cover a sticky bar or the top of whatever was just scrolled to. On
  // desktop both bars are display:none, so they report 0 and every offset
  // built on them collapses to nothing.
  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      root.style.setProperty("--chrome-top", `${topRef.current?.offsetHeight ?? 0}px`);
      root.style.setProperty("--chrome-bottom", `${tabsRef.current?.offsetHeight ?? 0}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    if (tabsRef.current) ro.observe(tabsRef.current);
    return () => ro.disconnect();
  }, []);

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
    <div ref={rootRef} className="appshell" data-rail={railOff ? "off" : "on"}>
      {/* Twelve nav links stand between the top of the page and the content.
          Hidden until focused, so it only appears for the keyboard users it
          is for. */}
      <a href="#content" className="skiplink">
        Skip to content
      </a>
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
          {/* The name was already the one personal thing in the rail, so it
              becomes the way in to /account rather than spending a nav slot
              on it. Rail link styling is scoped to `.rail nav a`, so this
              anchor keeps the plain `.me` treatment. */}
          <Link href="/account" className="me" title={`${userName} · ${roleLabel}`}>
            {/* The picture occupies the same 30px slot as the initials, so the
                rail does not reflow depending on whether someone uploaded one.
                Plain <img>, not next/image: the src is a signed URL that
                rotates every hour, which the optimiser would cache a fresh
                copy of each time for no benefit at this size. */}
            <i aria-hidden>
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="" />
              ) : (
                initialsOf(userName)
              )}
            </i>
            <span>{userName}</span>
          </Link>
          <span className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <SignOutIcon />
          </span>
        </div>
      </aside>

      <div className="shellmain">
        {backdrop}
        <header ref={topRef} className="topbar">
          <span className="mark" role="img" aria-label="BSMS Tajweed" />
          <span className="flex items-center gap-1.5">
            {/* The rail is hidden at this width, so the name-as-link route to
                /account is gone with it — this is the mobile way in. */}
            <Link href="/account" aria-label="Account" title="Account" className="railbtn">
              <User className="size-[15px]" />
            </Link>
            <ThemeToggle />
            <SignOutIcon />
          </span>
        </header>

        {/* The skip link's target, and what the router brings into view on a
            navigation. The scroll margin keeps the top of the page clear of
            the phone's top bar, which would otherwise cover it. */}
        <main id="content" tabIndex={-1} className="shellview scroll-mt-[var(--chrome-top,0px)]">{children}</main>

        <nav ref={tabsRef} className="tabs">
          {mobileNav.tabs.map((item) => {
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
          {mobileNav.more.length > 0 && (
            <MoreTab items={mobileNav.more} userName={userName} avatarSrc={avatarSrc} />
          )}
        </nav>
      </div>
    </div>
  );
}
