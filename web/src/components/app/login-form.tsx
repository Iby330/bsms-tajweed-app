"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PASSWORD_RESET_READY } from "@/lib/flags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Survives sign-out on purpose: coming back should only ask for a password. */
const LAST_EMAIL_KEY = "bsms:last-email";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [returning, setReturning] = useState(false);

  // Read after mount — localStorage doesn't exist during the server render, and
  // seeding state from it directly would mismatch on hydration.
  useEffect(() => {
    const saved = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setReturning(true);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Incorrect email or password.");
      setBusy(false);
      return;
    }

    window.localStorage.setItem(LAST_EMAIL_KEY, email);

    // Only ever follow an in-app path, so a crafted ?next=https://… can't turn
    // the login screen into an open redirect.
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          // Red squiggles under an address help nobody.
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          {PASSWORD_RESET_READY && (
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>
          )}
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus={returning}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {returning ? (
        <button
          type="button"
          onClick={() => {
            window.localStorage.removeItem(LAST_EMAIL_KEY);
            setEmail("");
            setReturning(false);
          }}
          className="block w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Not you? Use a different account
        </button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Access is by invitation — speak to your teacher if you need one.
        </p>
      )}
      {/* With the reset link hidden, someone who has forgotten their password
          is otherwise left with no way forward at all — and a returning
          visitor never sees the invitation line above, because it is replaced
          by "Not you?". This says what to do either way. */}
      {!PASSWORD_RESET_READY && (
        <p className="text-center text-xs text-muted-foreground">
          Forgotten your password? Ask your teacher to reset it.
        </p>
      )}
    </form>
  );
}
