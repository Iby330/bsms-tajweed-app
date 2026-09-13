import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRAND_LOGO } from "@/lib/theme/brand";
import { feeLabel } from "@/lib/applications/form";

/**
 * The splash.
 *
 * Signed-in visitors never see it — the proxy sends them straight to /home —
 * so everyone reading this is either signed out or new. It used to speak only
 * to the first group, offering Sign in and explaining that access is by
 * invitation; with applications open on our own domain at /apply, the second
 * group is now the larger one and gets the primary button.
 */
export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-16">
      <Image
        src={BRAND_LOGO}
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

      <div className="flex w-full max-w-xs flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
        <Link
          href="/apply"
          className={cn(buttonVariants({ size: "lg" }), "px-10")}
        >
          Apply to join
        </Link>
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "px-10")}
        >
          Sign in
        </Link>
      </div>

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Applications are open for the coming year — {feeLabel()}{" "}for the year.
        Already on the course? Sign in above, or speak to your teacher if you
        need a login.
      </p>
    </div>
  );
}
