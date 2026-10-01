"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A failed student page lands here, inside the shell, so the nav stays put
 * and the rest of the app is one tap away. Same reasoning as the hifdh one:
 * Try again re-fetches the segment, and production hides the message.
 */
export default function StudentError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="text-sm">Something went wrong on this page.</p>
      <p className="text-sm text-muted-foreground">
        It&apos;s usually a dropped connection. Try again, or head back home
        and come back to it.
      </p>
      <div className="flex justify-center gap-3">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Link href="/home" className={cn(buttonVariants({ variant: "outline" }))}>
          Go home
        </Link>
      </div>
    </div>
  );
}
