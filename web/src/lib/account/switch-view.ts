"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SEAT_COOKIE, validSeat } from "@/lib/supabase/seat";

/**
 * Into a seat this login owns, or back (`null`). The cookie has no maxAge, so
 * it ends with the browser session and a fresh visit opens on the teacher's own
 * class. Not httpOnly: the browser client reads it, and it grants nothing,
 * because acting_id() checks ownership again on every request.
 */
export async function switchView(seatId: string | null): Promise<void> {
  const store = await cookies();
  if (seatId === null) {
    store.delete(SEAT_COOKIE);
    redirect("/teacher/home");
  }
  const seat = validSeat(seatId);
  if (!seat) throw new Error("Unknown view.");
  const db = await supabaseServer({ asLogin: true });
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) throw new Error("Sign in first.");
  const { data } = await db.from("profiles").select("id").eq("id", seat).eq("login_id", userId).maybeSingle();
  if (!data) throw new Error("Unknown view.");
  store.set(SEAT_COOKIE, seat, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect("/home");
}
