import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ConfirmContinueForm } from "@/components/app/confirm-continue-form";
import { safeNext } from "@/lib/safe-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_LOGO } from "@/lib/theme/brand";

export const metadata: Metadata = { title: "Continue" };

/** The token is in the query string, so this is never served from cache. */
export const dynamic = "force-dynamic";

/**
 * Where the link in every auth email lands: password resets, and the login
 * emails new students and teachers get.
 *
 * It deliberately does NOT redeem the token. Opening this page changes
 * nothing; pressing Continue posts the token to ./verify, which does. That
 * split is the fix for university mail scanners, which open every link in a
 * message and so used to spend the token before its owner ever saw it.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);
  const tokenHash = one(params.token_hash);
  const type = one(params.type);
  const next = safeNext(one(params.next));

  const settingUp = next === "/welcome";
  const title = !tokenHash || !type
    ? "Link not recognised"
    : settingUp ? "Set up your account" : "Choose a new password";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm border-line">
        <CardHeader className="items-center text-center">
          <Image src={BRAND_LOGO} alt="BSMS Tajweed" width={72} height={72}
            className="mx-auto mb-2 rounded-xl" priority />
          <CardTitle className="font-heading text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          {tokenHash && type ? (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {settingUp
                  ? "Press Continue to choose your password and get into your class."
                  : "Press Continue to choose a new password for your account."}
              </p>
              <ConfirmContinueForm tokenHash={tokenHash} type={type} next={next} />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                This link is incomplete. It may have been cut short when it was
                copied. Request a fresh one and it&apos;ll work.
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
