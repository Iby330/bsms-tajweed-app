import Image from "next/image";
import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/app/sign-out-button";

export const dynamic = "force-dynamic";

/** Where a deactivated student lands. The record is kept — nothing is deleted —
 *  so reactivating is a single flag flip and their whole year comes back. */
export default async function Locked() {
  const profile = await currentProfile();
  if (!profile) redirect("/login");
  if (profile.is_active) redirect("/home");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Image
        src="/brand/logo.png"
        alt="BSMS Tajweed"
        width={88}
        height={88}
        className="rounded-2xl opacity-60"
        priority
      />
      <div className="max-w-sm space-y-3">
        <h1 className="text-2xl">Your place is on hold</h1>
        <p className="text-sm text-muted-foreground">
          Your account isn&apos;t active at the moment, so lessons and homework
          are paused. Nothing has been lost — your marks, hifz progress and
          feedback are all still here waiting.
        </p>
        <p className="text-sm text-muted-foreground">
          Have a word with your teacher and they can switch it back on.
        </p>
      </div>
      <SignOutButton />
    </div>
  );
}
