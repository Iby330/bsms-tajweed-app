import Image from "next/image";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/app/forgot-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // /auth/confirm sends people back here with ?error=link when a token is
  // stale or already spent, so the dead end explains itself.
  const { error } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm border-line">
        <CardHeader className="items-center text-center">
          <Image src="/brand/logo.png" alt="BSMS Tajweed" width={72} height={72}
            className="mx-auto mb-2 rounded-xl" priority />
          <CardTitle className="font-heading text-xl">Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm linkExpired={error === "link"} />
        </CardContent>
      </Card>
    </div>
  );
}
