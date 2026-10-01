"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import "./globals.css";

/**
 * Only for a failure in the root layout itself, which takes the layout's
 * <html>, fonts and theme down with it — so this renders its own document,
 * pinned to the navy scheme the root layout would have set. A plain <a>
 * rather than Link: with the root broken, a full load is the reliable way
 * home.
 */
export default function GlobalError({
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
    <html lang="en" data-brand="navy">
      <body className="min-h-full antialiased">
        <title>Something went wrong · BSMS Tajweed</title>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="max-w-sm space-y-3">
            <h1 className="text-2xl">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              The app didn&apos;t load properly. It&apos;s usually a dropped
              connection, and trying again sorts it out.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Try again
            </button>
            <a href="/home" className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
