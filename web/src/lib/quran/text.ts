/**
 * Qur'anic text as Uthmanic Hafs needs it — pure, no IO.
 *
 * The Uthmani text (QUL, and our quran_words seed copied from it) writes a
 * dagger alif after a tatweel: هَـٰذَا, ٱلنَّفَّـٰثَـٰتِ. The tatweel (U+0640) is
 * only a carrier and changes no letter and no sound, but Uthmanic Hafs
 * mis-places the pair — it sets the alif adrift past the letter after the one
 * it lengthens. Attached straight to its letter (U+0670 alone) the alif sits
 * where it belongs. The class verses and the application form were already
 * written that way by hand; this does it wherever text is drawn.
 */
export function seatDaggerAlif(text: string): string {
  return text.replace(/ـٰ/g, "ٰ");
}
