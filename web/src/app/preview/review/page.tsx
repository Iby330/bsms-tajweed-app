import type { Metadata } from "next";
import TajweedReview from "@/components/landing/tajweed/TajweedReview";

/**
 * The hero's review desk: every word of Al-Ma'idah 5:95, each rule on it drawn
 * with only its own letters lit, and the exact second each one lights — beside
 * the real animation with a scrubber, slow speeds and word-by-word stepping.
 *
 * For the people checking the piece (a teacher signing off the marking, the
 * team judging the timing), not for visitors. It reads no data.
 */
export const metadata: Metadata = {
  title: "Hero review",
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return <TajweedReview />;
}
