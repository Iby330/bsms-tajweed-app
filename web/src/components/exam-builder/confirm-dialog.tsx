"use client";

/**
 * "Are you sure?" for the builder's few irreversible or weighty steps:
 * deleting a paper, removing a section with questions in it, marking a paper
 * final. Controlled by the caller; `onConfirm` may be async and return an
 * error, which is shown here and keeps the dialog open.
 */
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  tone?: "default" | "destructive";
  /** Resolve to an error message to stay open and show it, or nothing to close. */
  onConfirm: () => Promise<string | void> | string | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const change = (next: boolean) => {
    if (!next) setError(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent frameClassName="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription render={<div />}>{children}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const err = await onConfirm();
                if (err) setError(err);
                else change(false);
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
