"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The catch-all for a failed page outside the student area, which has its own
 * inside the app shell. Try again re-fetches the segment, which is what a
 * dropped connection needs; production hides the error's message, so none is
 * shown.
 */
export default function AppError({
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="text-2xl">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This page didn&apos;t load properly. It&apos;s usually a dropped
          connection, and trying again sorts it out.
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Link href="/home" className={cn(buttonVariants({ variant: "outline" }))}>
          Go home
        </Link>
      </div>
    </div>
  );
}
