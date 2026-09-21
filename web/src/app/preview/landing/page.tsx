import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

/**
 * The landing page as a design surface.
 *
 * The page itself now lives at `/`. This route stays because it carries the
 * `?shot=1` lens: it shrinks the hero from a full viewport to a fixed band and
 * poses the animation on one frame, so a headless screenshot captures the page
 * rather than a navy rectangle. That belongs nowhere near the real route.
 *
 * It renders the SAME component as `/`, so what is tuned here is what ships.
 */

export const metadata: Metadata = {
  title: "Landing preview",
  robots: { index: false, follow: false },
};

export default async function LandingPreview({
  searchParams,
}: {
  searchParams: Promise<{ shot?: string }>;
}) {
  const shot = (await searchParams).shot === "1";
  return <LandingPage shot={shot} />;
}
