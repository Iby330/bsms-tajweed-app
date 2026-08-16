"use client";

import { useState, useTransition } from "react";
import { setOwnName } from "@/lib/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * A teacher naming themselves.
 *
 * Accounts are handed over rather than created — a teacher inherits the one
 * their class was already attached to, which arrives carrying a placeholder
 * name. This is where they replace it, and it is the only place that name
 * lives, so every screen follows from here.
 */
export function NameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== initial.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setOwnName(name);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="full-name">Your full name</Label>
        <Input
          id="full-name"
          name="name"
          autoComplete="name"
          value={name}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          This is what students and other teachers see on the register, the
          roster and the deposit tracker.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save name"}
        </Button>
        <span
          aria-live="polite"
          className={cn("text-xs text-ok transition-opacity", saved ? "opacity-100" : "opacity-0")}
        >
          Saved
        </span>
      </div>
    </form>
  );
}
