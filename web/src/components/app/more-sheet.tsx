"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ellipsis } from "lucide-react";
import {
  Dialog, DialogContent, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ICONS } from "./nav-icons";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/nav";

/** Two initials stand in for a picture nobody uploaded. Lives here rather
 *  than in the shell because the shell imports this file, not the other way
 *  round. */
export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The fifth cell of the phone tab bar: everything the other four cannot hold.
 *
 * Without it a teacher on a phone had no route to curriculum, calendar,
 * classes, applications or deposits — the rail those live in is hidden below
 * 1024px and nothing else linked to them.
 */
export function MoreTab({
  items,
  userName,
  avatarSrc,
}: {
  /** the nav items that did not win a cell */
  items: NavItem[];
  userName: string;
  /** signed URL for their picture, or null — initials stand in when absent */
  avatarSrc?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Navigating from inside the sheet does not unmount it, so nothing else
  // would ever close it.
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  // Same shape as the rail: live items first, "coming soon" under its own
  // heading rather than looking like broken links among them.
  const live = items.filter((i) => !i.comingSoon);
  const soon = items.filter((i) => i.comingSoon);

  const row = (item: NavItem) => {
    const Icon = ICONS[item.icon];
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive(item.href) ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-3 text-sm",
          isActive(item.href) && "font-semibold",
          item.comingSoon && "soon opacity-45",
        )}
      >
        <Icon className="size-[17px] shrink-0" />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Same markup shape as a tab link, so the cell lines up with the four
          beside it. It is a <button>, not an <a>, hence data-active rather
          than aria-current. */}
      <DialogTrigger data-active={items.some((i) => isActive(i.href)) ? "" : undefined}>
        <Ellipsis className="size-[19px]" />
        <span>More</span>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogTitle>More</DialogTitle>
        <div className="grid gap-1">
          {/* The rail reaches /account through the name in its foot. That is
              gone at this width, so the sheet carries it the same way. */}
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm"
          >
            <i
              aria-hidden
              className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground/10 text-[0.6rem] font-semibold not-italic"
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="" className="size-full object-cover" />
              ) : (
                initialsOf(userName)
              )}
            </i>
            <span>{userName}</span>
          </Link>
          {live.map(row)}
          {soon.length > 0 && (
            <div className="grp px-3 pt-3 font-mono text-[0.58rem] tracking-[0.18em] uppercase opacity-60">
              Coming soon
            </div>
          )}
          {soon.map(row)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
