import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

/**
 * bsmstajweed.com/landing.
 *
 * The full landing page, shown to everybody. It sat at `/` while sign-ups were
 * open; once they closed, the bare domain became the way into the app (see
 * proxy.ts) and this moved here so it can still be linked to.
 *
 * The page itself lives in a component because /preview/landing renders it
 * too, with the `?shot` lens for screenshots. One implementation, two routes:
 * the design surface can never drift from what the domain actually serves.
 */

export const metadata: Metadata = {
  description:
    "Tajweed and Qur'an memorisation for the Brighton Sussex Muslim Students programme. Two evenings a week at Al-Medinah Mosque, three terms, taught from the letters up.",
  alternates: { canonical: "/landing" },
};

export default function Landing() {
  return <LandingPage />;
}
