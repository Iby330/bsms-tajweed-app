"use client";

/**
 * A small drop-down menu for the builder (Export, Move to section, Add to a
 * section). Base UI's Menu underneath, so arrow keys, Escape, focus return
 * and outside-click all come with it; this file only gives it the app's look.
 * The popup is portalled, so on the paper sheet it follows the theme rather
 * than the sheet's pinned light tokens.
 */
import type { ReactElement, ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

const ITEM =
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-popover-foreground outline-none select-none data-highlighted:bg-muted data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export function ActionMenu({
  trigger,
  children,
  align = "end",
  label,
}: {
  /** A Button element; it becomes the menu's trigger. */
  trigger: ReactElement;
  children: ReactNode;
  align?: "start" | "center" | "end";
  /** Heading shown at the top of the popup, if any. */
  label?: string;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger render={trigger} />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align={align} sideOffset={6} className="z-50 outline-none">
          <Menu.Popup
            className={cn(
              "min-w-56 max-w-[min(22rem,calc(100vw-1rem))] rounded-lg bg-popover p-1 font-sans text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none",
              "origin-(--transform-origin) transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            )}
          >
            {label && <div className="px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground">{label}</div>}
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function ActionItem({
  onSelect,
  disabled,
  children,
  className,
}: {
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Menu.Item onClick={onSelect} disabled={disabled} className={cn(ITEM, className)}>
      {children}
    </Menu.Item>
  );
}

/** A menu entry that opens a page in a new tab. */
export function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Menu.LinkItem href={href} target="_blank" rel="noopener" className={cn(ITEM, "no-underline")}>
      {children}
    </Menu.LinkItem>
  );
}

export function ActionSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />;
}
