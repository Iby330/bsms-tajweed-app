"use client";

import { useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import { switchView } from "@/lib/account/switch-view";
import { cn } from "@/lib/utils";

export type ViewSwitchTarget = { seatId: string | null; label: string };

/** A teacher's own class to Esteemed Ustadhs and back. Rendered only for a
 *  login with a seat, so no one else ever sees it. */
export function ViewSwitch({ target, className }: { target: ViewSwitchTarget; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      title={target.label}
      aria-label={target.label}
      onClick={() => start(() => switchView(target.seatId))}
      className={cn("disabled:opacity-50", className)}
    >
      <ArrowLeftRight className="size-[15px] shrink-0" aria-hidden />
      <span className="lb">{pending ? "Switching…" : target.label}</span>
    </button>
  );
}
