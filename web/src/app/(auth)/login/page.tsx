import Image from "next/image";
import { LoginForm } from "@/components/app/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm border-line">
        <CardHeader className="items-center text-center">
          <Image src="/brand/logo.png" alt="BSMS Tajweed" width={72} height={72}
            className="mx-auto mb-2 rounded-xl" priority />
          <CardTitle className="font-heading text-xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
