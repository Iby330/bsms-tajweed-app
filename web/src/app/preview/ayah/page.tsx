import type { Metadata } from "next";
import TajweedHeroPlayer from "@/components/landing/tajweed/TajweedHeroPlayer";

/**
 * The hero animation on its own, full-bleed, with nothing else on the page.
 *
 * It exists to be looked at while the motion is being tuned — in a browser,
 * and by a headless Chrome checking that the ball lands on the words and the
 * right letters light.
 *
 * `?f=240` freezes the piece at that frame. Headless Chrome produces almost no
 * animation frames however large its virtual time budget, so without a way to
 * pose the animation every screenshot comes back looking like the first one.
 * It is a lens on the preview route, not a control on the hero: the hero
 * itself has none.
 *
 * Resize past 767px to switch between the desktop and mobile compositions —
 * they are different layouts, not one scaled, so both need looking at.
 */
export const metadata: Metadata = {
  title: "Ayah preview",
  robots: { index: false, follow: false },
};

export default async function AyahPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const raw = Number((await searchParams).f);
  const frame = Number.isFinite(raw) ? raw : undefined;

  return (
    <main style={{ position: "relative", minHeight: "100dvh", background: "#00004D" }}>
      <TajweedHeroPlayer frame={frame} />
    </main>
  );
}
