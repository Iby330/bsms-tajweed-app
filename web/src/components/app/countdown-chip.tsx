"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { countdown } from "@/lib/homework/logic";

export function CountdownChip({ dueAt }: { dueAt: string }) {
  const [state, setState] = useState(() => countdown(new Date(), dueAt));
  useEffect(() => {
    const t = setInterval(() => setState(countdown(new Date(), dueAt)), 60_000);
    return () => clearInterval(t);
  }, [dueAt]);
  return (
    <span className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
      state.tone === "default" && "bg-muted text-muted-foreground",
      state.tone === "warn" && "bg-warn/12 text-warn",
      state.tone === "danger" && "bg-danger/12 text-danger",
      state.tone === "overdue" && "bg-danger/12 text-danger",
    )}>
      {state.tone === "overdue" ? "Overdue" : `due in ${state.label}`}
    </span>
  );
}
