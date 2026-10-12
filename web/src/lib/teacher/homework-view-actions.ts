"use server";

import { cookies } from "next/headers";
import { HW_VIEW_COOKIE, type HwView } from "./homework-view";

/** Remember List or Table for this browser, for a year. */
export async function rememberHwView(view: HwView) {
  if (view !== "list" && view !== "table") return;
  (await cookies()).set(HW_VIEW_COOKIE, view, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
