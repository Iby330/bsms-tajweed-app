"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { SEAT_COOKIE, SEAT_HEADER, seatFromCookieString } from "./seat";

export function supabaseBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // createBrowserClient hands back one shared instance, so the seat is
        // read on each request rather than fixed when the client was made.
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          const seat = seatFromCookieString(document.cookie);
          if (seat) headers.set(SEAT_HEADER, seat);
          return fetch(input, { ...init, headers });
        },
      },
    },
  );
}

/** Signing out ends the seat too, or the next sign-in opens as a student. */
export function clearSeatCookie() {
  document.cookie = `${SEAT_COOKIE}=; path=/; max-age=0`;
}
