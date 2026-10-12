"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The catch-all for a failed page outside the student area, which has its own
 * inside the app shell. Try again reloads the page. It used to retry the
 * segment in place (unstable_retry), which could not recover a page broken by
 * a server action's response: the teacher pressed it and nothing happened. A
 * full reload fetches everything again, which a dropped connection needs too.
 * Production hides the error's message, so none is shown.
 */
export default function AppError({
  error,
}: {
  error: Error & { digest?: string };
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
        <Button onClick={() => window.location.reload()}>Try again</Button>
        <Link href="/home" className={cn(buttonVariants({ variant: "outline" }))}>
          Go home
        </Link>
      </div>
    </div>
  );
}
