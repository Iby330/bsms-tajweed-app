"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check } from "lucide-react";
import { completeSetup } from "@/lib/account/setup-actions";
import { saveAvatar } from "@/lib/account/avatar-actions";
import { checkPassword, MIN_PASSWORD_LENGTH } from "@/lib/account/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * First run for an invited teacher: name, password, and a photo if they want one.
 *
 * The email is shown but not editable — it is the address the invitation went
 * to, and the account is already attached to it. Making it a field would invite
 * someone to change it and then wonder why nothing works.
 */
export function SetupForm({ email }: { email: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setError("That image is over 2 MB. Try a smaller one.");
      return;
    }
    setError(null);
    setFile(f);
    // Shown from memory so they see the crop before anything is uploaded.
    setPreview(URL.createObjectURL(f));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const complaint = checkPassword(password, confirm);
    if (complaint) {
      setError(complaint);
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = await completeSetup(first, last, password, confirm);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // The picture is optional, so a failure here must not block the sign-in
      // they have just completed — they can add one later from /account.
      if (file) {
        const fd = new FormData();
        fd.append("avatar", file);
        await saveAvatar(fd);
      }
      router.replace("/home");
      router.refresh();
    });
  }

  const initials = `${first.trim()[0] ?? ""}${last.trim()[0] ?? ""}`.toUpperCase();

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* photo ------------------------------------------------------- */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="group relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-muted text-muted-foreground transition-colors hover:border-ok focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok"
          aria-label="Choose a profile picture"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : initials ? (
            <span className="font-heading text-lg">{initials}</span>
          ) : (
            <Camera className="size-5" />
          )}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Profile picture</p>
          <p className="text-xs text-muted-foreground">
            Optional. {preview ? "Tap the circle to change it." : "JPG, PNG or WebP, up to 2 MB."}
          </p>
        </div>
        <input
          ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp"
          onChange={pick} className="sr-only" tabIndex={-1}
        />
      </div>

      {/* name -------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="first">First name</Label>
          <Input id="first" name="given-name" autoComplete="given-name" required
                 autoFocus value={first} disabled={pending}
                 onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="last">Last name</Label>
          <Input id="last" name="family-name" autoComplete="family-name" required
                 value={last} disabled={pending}
                 onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>

      {/* email — fixed ------------------------------------------------ */}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-muted/40 px-2.5 py-2">
          <Check className="size-3.5 shrink-0 text-ok" />
          <span id="email" className="truncate text-sm">{email}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          The address your invitation was sent to. Ask the programme lead to change it.
        </p>
      </div>

      {/* password ----------------------------------------------------- */}
      <div className="space-y-1.5">
        <Label htmlFor="password">Create a password</Label>
        <Input id="password" type="password" autoComplete="new-password" required
               minLength={MIN_PASSWORD_LENGTH} value={password} disabled={pending}
               onChange={(e) => setPassword(e.target.value)} />
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" type="password" autoComplete="new-password" required
               value={confirm} disabled={pending}
               onChange={(e) => setConfirm(e.target.value)} />
      </div>

      {error && <p className={cn("text-sm text-danger")}>{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Setting up…" : "Finish and sign in"}
      </Button>
    </form>
  );
}
