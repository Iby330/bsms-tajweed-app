import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6">
      <Image
        src="/brand/logo.png"
        alt="BSMS Tajweed"
        width={160}
        height={160}
        className="rounded-2xl"
        priority
      />
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl">BSMS TAJWEED</h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          Tajweed and Qur&apos;an memorisation for the Brighton Sussex Muslim
          Students programme.
        </p>
      </div>
      <Link
        href="/login"
        className={cn(buttonVariants({ size: "lg" }), "px-10")}
      >
        Sign in
      </Link>
      <p className="text-xs text-muted-foreground">
        Access is by invitation — speak to your teacher if you need one.
      </p>
    </div>
  );
}
