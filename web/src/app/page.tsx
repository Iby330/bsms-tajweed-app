import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

/**
 * bsmstajweed.com.
 *
 * This used to be a splash: a logo, two buttons and a line of text, shown only
 * to signed-out visitors because the proxy sent everyone else to /home. It is
 * now the full landing page, and the proxy no longer redirects away from `/`,
 * so this is what the domain shows to everybody — applicants, students and
 * teachers alike. Signing in is a link in the nav rather than an automatic
 * detour.
 *
 * The page itself lives in a component because /preview/landing renders it
 * too, with the `?shot` lens for screenshots. One implementation, two routes:
 * the design surface can never drift from what the domain actually serves.
 */

export const metadata: Metadata = {
  description:
    "Tajweed and Qur'an memorisation for the Brighton Sussex Muslim Students programme. Two evenings a week at Al-Medinah Mosque, three terms, taught from the letters up.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <LandingPage />;
}
