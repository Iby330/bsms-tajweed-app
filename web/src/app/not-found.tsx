import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_LOGO } from "@/lib/theme/brand";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Signed-out visitors rarely see this: the proxy sends them to /login from
 * any path it doesn't know. So it is written for someone already in, who
 * followed an old link or mistyped one, and the way back is their home.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Image
        src={BRAND_LOGO}
        alt="BSMS Tajweed"
        width={88}
        height={88}
        className="rounded-2xl opacity-60"
        priority
      />
      <div className="max-w-sm space-y-3">
        <h1 className="text-2xl">We couldn&apos;t find that page</h1>
        <p className="text-sm text-muted-foreground">
          The link may be old, or the page may have moved.
        </p>
      </div>
      <Link href="/home" className={cn(buttonVariants({ variant: "outline" }))}>
        Go home
      </Link>
    </div>
  );
}
