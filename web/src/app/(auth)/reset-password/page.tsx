import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/app/reset-password-form";
import { RECOVERY_COOKIE } from "@/lib/account/recovery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Choose a new password" };

/** Never prerendered: what this screen shows turns entirely on a cookie. */
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // Being signed in is not the qualification here — having come through a
  // recovery link is. See lib/account/recovery.ts for why the two differ.
  const recovering = Boolean((await cookies()).get(RECOVERY_COOKIE));

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm border-line">
        <CardHeader className="items-center text-center">
          <Image src="/brand/logo.png" alt="BSMS Tajweed" width={72} height={72}
            className="mx-auto mb-2 rounded-xl" priority />
          <CardTitle className="font-heading text-xl">
            {recovering ? "Choose a new password" : "Link expired"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recovering ? (
            <ResetPasswordForm />
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                This reset link has expired or has already been used. Request a
                fresh one and it&apos;ll work.
              </p>
              <Link href="/forgot-password" className={cn(buttonVariants(), "w-full")}>
                Request a new link
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
