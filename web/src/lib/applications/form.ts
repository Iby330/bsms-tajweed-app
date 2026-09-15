import {
  SECTION_TIMETABLES, TERMS, teachingDaysLabel, weekdayNameFor,
  SISTERS_HIFDH_DAY_PROVISIONAL, type Section,
} from "@/lib/attendance/calendar";
import { fmtDay } from "@/lib/format";

/**
 * The application form's questions, in one place.
 *
 * Both ends read this module: the public form renders the options, and the
 * teacher screen renders the answers back. That matters more than it sounds —
 * the answers are stored as the text that was shown, so a list edited on one
 * side only would quietly stop matching the rows already in the table.
 *
 * The wording is carried over from the Google Form that ran the previous four
 * intakes, close to verbatim, so the answers stay comparable year on year.
 * Where it changed, the comment says why.
 */

/* ── Who they are ─────────────────────────────────────────────────────── */

/**
 * The form asks gender; the programme runs on sides. Here is the one place
 * the two are tied together, so nothing downstream has to know that a female
 * applicant is a sister.
 *
 * Ordered female-first exactly as the old form had it.
 */
export const GENDERS = [
  { value: "female", label: "Female", section: "sisters" },
  { value: "male", label: "Male", section: "brothers" },
] as const satisfies readonly { value: string; label: string; section: Section }[];

export type Gender = (typeof GENDERS)[number]["value"];

export function sectionForGender(gender: string): Section | null {
  return GENDERS.find((g) => g.value === gender)?.section ?? null;
}

/* ── Where they're from ───────────────────────────────────────────────── */

/**
 * "Other" is the last option in each of these lists and means the same thing
 * everywhere: show a text box and store what was typed instead of the word
 * "Other". A row reading `university: "Other"` would record nothing at all.
 */
export const OTHER = "Other";

export const UNIVERSITIES = ["BSMS", "Brighton", "Sussex", OTHER] as const;

export const YEARS = ["1", "2", "3", "4", "5", "Alumni", OTHER] as const;

/* ── Where they are with the Qur'an ───────────────────────────────────── */

/** Verbatim from the old form, down to the comma-less phrasing. */
export const ARABIC_READING = [
  "Yes confidently and fluently",
  "Yes but I am not that quick",
  "No I do not know the alphabet",
] as const;

/** Verbatim from the old form. These four are what the recitation session is
 *  checked against, so re-wording them would break the comparison. */
export const TAJWEED_LEVELS = [
  "I have never heard of it before",
  "I have heard of it and know a few rules",
  "I feel confident in a few rules but forget to apply it sometimes",
  "I know the majority of the basic rules and apply it all/most of the time",
] as const;

/* ── The two questions this year adds ─────────────────────────────────── */

/**
 * Replaces "Where did you get access to this link?", which offered only
 * Whatsapp / Instagram / Other. That question could only ever describe the
 * last hop the link made, not how somebody came to hear of the programme —
 * a friend forwarding a WhatsApp message and a poster at the mosque both
 * answered "Whatsapp". These are the routes worth telling apart when deciding
 * where next year's effort goes.
 */
export const HEARD_FROM = [
  "WhatsApp",
  "Instagram",
  "A friend told me",
  "A university or ISOC event",
  "At the mosque",
  "I was on the course before",
  OTHER,
] as const;

/** Replaces "What are you hoping to gain from this course?" */
export const MOTIVATION_QUESTION = "What made you want to join?";

/* ── When applications close ──────────────────────────────────────────── */

/**
 * Wednesday 30 September 2026, 2pm.
 *
 * Held as a UTC INSTANT rather than a local date string, because a server in
 * one zone and an applicant in another have to agree on the moment to the
 * minute — a naive "2026-09-30T14:00" is parsed as local time and would close
 * the form an hour early or late depending on where it is read. 2pm in London
 * on 30 September is still British Summer Time (BST does not end until the
 * last Sunday of October), so 14:00 BST is 13:00Z.
 *
 * `CLOSES_LABEL` is written out rather than formatted at runtime so that the
 * words an applicant reads cannot drift with the viewer's locale — an
 * American browser would otherwise be told "9/30/2026". There is a test
 * holding the two to each other, so changing the date and forgetting the
 * label, or getting the offset wrong, fails the build rather than the intake.
 */
export const SIGNUPS_CLOSE = new Date("2026-09-30T13:00:00Z");

export const CLOSES_LABEL = "Wednesday 30 September at 2pm";

/**
 * Whether the form is still taking applications.
 *
 * Takes `now` so it can be tested, and so the page and the server action ask
 * the same question of the same clock. The server's answer is the one that
 * counts: the page can be cached or left open in a tab, and a browser's
 * clock is the applicant's to set.
 */
export function signupsOpen(now: Date = new Date()): boolean {
  return now.getTime() < SIGNUPS_CLOSE.getTime();
}

/**
 * Which year of the programme this intake is.
 *
 * ⚠️ CONFIRM. The 2025/26 form opened "for our fifth year", so 2026/27 is the
 * sixth — but that is arithmetic on one sentence rather than something anyone
 * has told us, and it is the first line a new applicant reads.
 */
export const PROGRAMME_YEAR = "sixth";

/* ── The fee ──────────────────────────────────────────────────────────── */

/**
 * £20 for 2026/27, up from £10 for 2025/26. One payment, for the whole year.
 *
 * Stored on each application row as well (`fee_pence`), so changing this next
 * year prices new applications without rewriting what this year's applicants
 * were asked for.
 */
export const FEE_PENCE = 2000;

export const feeLabel = () =>
  FEE_PENCE % 100 === 0 ? `£${FEE_PENCE / 100}` : `£${(FEE_PENCE / 100).toFixed(2)}`;

/**
 * Where the "Pay the fee" button goes.
 *
 * ⚠️ NOT YET SUPPLIED — paste the payment link here and the form completes
 * itself. It is deliberately a plain constant rather than an env var so that
 * it is version-controlled and reviewable, and deliberately nullable rather
 * than a placeholder URL, because a wrong link takes money to the wrong place
 * and a missing one does not.
 *
 * While it is null the form still works and still takes applications: the fee
 * is stated, and the page says payment details follow by email instead of
 * asking anyone to tick that they have paid. Set it and the button and the
 * confirmation tick both appear, with no other change needed.
 */
export const PAYMENT_LINK: string | null = null;

/* ── The terms ────────────────────────────────────────────────────────── */

/**
 * ⚠️ CONFIRM BEFORE THE FORM GOES OUT. Carried over from last year's form,
 * which said "Al-medinah mosque".
 */
export const VENUE = "Al-Medinah Mosque";

/**
 * The terms an applicant agrees to, per side.
 *
 * Taken as a function of the section rather than written out, because the two
 * sides no longer sit on the same evenings and the old form's flat "Monday
 * and Thursday Evenings" is now wrong for the sisters. The days come from
 * SECTION_TIMETABLES, which is also what the register and both calendar
 * screens read — so a timetable change moves this page with it instead of
 * leaving a public promise behind that nobody remembers to edit.
 */
export function termsFor(section: Section): { title: string; body: string }[] {
  const tt = SECTION_TIMETABLES[section];
  const tajweedDay = weekdayNameFor(tt, "tajweed");
  const hifdhDay = weekdayNameFor(tt, "hifdh");

  // The sisters settle their hifdh evening against student availability each
  // September, and it can differ class by class. Promising a specific evening
  // before that happens would be a commitment made on a guess.
  const provisional = section === "sisters" && SISTERS_HIFDH_DAY_PROVISIONAL;

  const days = provisional
    ? `${tajweedDay} evenings for tajweed, plus one evening a week for hifdh. `
      + `The hifdh evening is set against everyone's availability and confirmed `
      + `before term starts.`
    : `${teachingDaysLabel(tt)} evenings: ${tajweedDay} for tajweed and `
      + `${hifdhDay} for hifdh.`;

  return [
    {
      title: "The fee",
      body:
        `${feeLabel()} once, covering the whole year. It is not a termly or monthly `
        + `charge, and there is nothing further to pay.`,
    },
    {
      title: "When classes run",
      body: `${days} Classes are held at ${VENUE}.`,
    },
    {
      title: "The year",
      body:
        `Three terms: ${fmtDay(TERMS[0].startsOn)} to ${fmtDay(TERMS[0].endsOn)}, `
        + `${fmtDay(TERMS[1].startsOn)} to ${fmtDay(TERMS[1].endsOn)}, and `
        + `${fmtDay(TERMS[2].startsOn)} to ${fmtDay(TERMS[2].endsOn)}, with breaks `
        + `between them.`,
    },
    {
      title: "Attendance",
      body:
        `Attendance is mandatory and is recorded at every session. Let your teacher `
        + `know in advance if you cannot make one.`,
    },
    {
      title: "Strikes",
      body:
        `Missed sessions and missed homework earn strikes. Three strikes within a `
        + `single term means being removed from the course.`,
    },
    {
      title: "Refunds",
      body:
        `If no place opens for you, the fee is refunded to you in full. If you take `
        + `a place and then cannot commit, or withdraw before a place opens, it is `
        + `not refunded.`,
    },
  ];
}

/* ── The opening verse ────────────────────────────────────────────────── */

/**
 * Al-Isrā' 17:9, which opened the old form.
 *
 * Taken verbatim from QUL (quran.com/api/v4/quran/verses/uthmani) rather than
 * retyped, with the same single deviation the class verses carry: the tatweel
 * (U+0640) in front of each dagger alif (U+0670) is stripped. The tatweel is
 * only a carrier and changes no letter and no sound, but Uthmanic Hafs
 * mis-places the pair — it sets the alif adrift past the letter after the one
 * it lengthens. Three of them here: هَـٰذَا, ٱلصَّـٰلِحَـٰتِ twice.
 *
 * Translation: Dr. Mustafa Khattab, The Clear Qur'an — the same one every
 * other translation in this app uses.
 */
export const OPENING_VERSE = {
  ar: "إِنَّ هَٰذَا ٱلْقُرْءَانَ يَهْدِى لِلَّتِى هِىَ أَقْوَمُ وَيُبَشِّرُ ٱلْمُؤْمِنِينَ ٱلَّذِينَ يَعْمَلُونَ ٱلصَّٰلِحَٰتِ أَنَّ لَهُمْ أَجْرًا كَبِيرًا",
  en:
    "Surely this Quran guides to what is most upright, and gives good news to "
    + "the believers who do good that they will have a mighty reward.",
  source: "Al-Isrā' 17:9",
} as const;
