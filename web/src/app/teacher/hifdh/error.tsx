"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Any failure in the hifdh pages (a mark that would not save, a page that
 * would not load) lands here instead of Next's full-page crash. Try again
 * re-fetches and re-renders the segment, which is what a dropped connection
 * needs; production hides the error's message, so none is shown.
 */
export default function HifdhError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <p className="text-sm">Something went wrong on this page.</p>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </div>
  );
}
