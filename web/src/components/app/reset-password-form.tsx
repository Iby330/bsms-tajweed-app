"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPasswordAfterRecovery } from "@/lib/account/actions";
import { checkPassword, MIN_PASSWORD_LENGTH } from "@/lib/account/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The end of the reset journey: they followed the email, /auth/confirm
 *  redeemed the token, and all that's left is choosing the new password. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const complaint = checkPassword(password, confirm);
    if (complaint) {
      setError(complaint);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await setPasswordAfterRecovery(password, confirm);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The recovery link already signed them in, so there is nothing left to
      // ask for — send them straight into the app. `refresh()` so the layouts
      // re-read the session rather than serving a cached signed-out shell.
      router.replace("/home");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
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
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
