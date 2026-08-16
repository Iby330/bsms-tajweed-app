"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Same key the login form writes — arriving here usually means the email is
 *  the one thing they do remember, so don't make them type it again. */
const LAST_EMAIL_KEY = "bsms:last-email";

export function ForgotPasswordForm({ linkExpired }: { linkExpired?: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (saved) setEmail(saved);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Built from the live origin rather than an env var so the same email
    // template serves localhost and production. The template appends the
    // token to it, so this must carry no query string of its own.
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });

    // Anything else is swallowed on purpose: telling one address apart from
    // another here is exactly how you enumerate who has an account. Rate
    // limiting is different — it's about this browser, not about whether the
    // address exists, and silence would just look like a broken button.
    if (error?.status === 429) {
      setError("Too many attempts just now. Wait a few minutes and try again.");
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p>
          If <span className="font-semibold">{email}</span> has an account, a
          link to set a new password is on its way.
        </p>
        <p className="text-muted-foreground">
          The link lasts an hour and can be opened on any device. Check the spam
          folder if it hasn&apos;t arrived in a minute or two.
        </p>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {linkExpired && (
        <p className="text-sm text-danger">
          That link has expired or has already been used. Request a new one.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          // Red squiggles under an address help nobody.
          spellCheck={false}
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <Link
        href="/login"
        className="block w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
