import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SetupForm } from "@/components/app/setup-form";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Set up your account" };

/** The session is the whole point of this screen — never serve it from cache. */
export const dynamic = "force-dynamic";

/**
 * Where an invitation lands.
 *
 * /auth/confirm has already redeemed the invite token by the time anyone gets
 * here, which is what makes the address on screen trustworthy: it is read from
 * the session, not from the link, so it cannot be swapped on the way in.
 */
export default async function Welcome() {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  const email = data.user?.email ?? null;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-line">
        <CardHeader className="items-center text-center">
          <Image src="/brand/logo.png" alt="BSMS Tajweed" width={64} height={64}
                 className="mx-auto mb-2 rounded-xl" priority />
          <CardTitle className="font-heading text-xl">
            {email ? "Set up your account" : "Invitation expired"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {email ? (
            <>
              <p className="mb-5 text-sm text-muted-foreground">
                Your classes and students are already waiting. This takes a minute.
              </p>
              <SetupForm email={email} />
            </>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                This invitation has expired or has already been used. Ask the
                programme lead to send another.
              </p>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                Back to sign in
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
