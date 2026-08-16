"use client";

import { useState, useTransition } from "react";
import { changePassword } from "@/lib/account/actions";
import { checkPassword, MIN_PASSWORD_LENGTH } from "@/lib/account/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Changing a password from inside the app, where the current one is the
 *  proof of identity. The forgotten-password path is /forgot-password. */
export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const complaint = checkPassword(password, confirm);
    if (complaint) {
      setError(complaint);
      setDone(false);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await changePassword(current, password, confirm);
      if (!result.ok) {
        setError(result.message);
        setDone(false);
        return;
      }
      // Cleared rather than left filled: the next person at this screen
      // shouldn't find the new password sitting in the boxes.
      setCurrent("");
      setPassword("");
      setConfirm("");
      setDone(true);
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current">Current password</Label>
        <Input
          id="current"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new">New password</Label>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {done && <p className="text-sm text-ok">Password updated.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
