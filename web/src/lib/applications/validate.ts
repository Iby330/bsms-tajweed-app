import {
  ARABIC_READING, FEE_PENCE, HEARD_FROM, OTHER, TAJWEED_LEVELS, UNIVERSITIES, YEARS,
  sectionForGender,
} from "./form";
import { DEFAULT_COUNTRY, countryByCode } from "./countries";
import type { Database } from "@/lib/database.types";

type Insert = Database["public"]["Tables"]["applications"]["Insert"];

/**
 * Turning what the public posted into a row, or into a reason why not.
 *
 * This is a SEPARATE module from actions.ts, with no database in it, because
 * it is the security boundary and wants testing directly. A server action is
 * a public HTTP endpoint: anyone can post to it with no browser, no form and
 * no JavaScript, so `required` in the markup stops nobody. These checks are
 * the ones that count, and the tests beside this file are the proof they
 * still do.
 *
 * The other half of the boundary is what this function CANNOT produce. It
 * returns the applicant's own answers and nothing else — no status, no
 * class_id, no notes, no fee_settled. Those stay at their database defaults
 * however the caller is shaped, so a hand-rolled request cannot post an
 * application that arrives already placed in a class.
 */

export type ApplicationInput = {
  firstName: string;
  surname: string;
  email: string;
  phone: string;
  /** ISO 3166-1 alpha-2 for the dialling code in front of `phone`. */
  phoneCountry: string;
  gender: string;
  university: string;
  universityOther: string;
  year: string;
  yearOther: string;
  enrolledBefore: string;
  memorised: string;
  arabicReading: string;
  tajweedLevel: string;
  heardFrom: string;
  heardFromOther: string;
  motivation: string;
  paidConfirmed: boolean;
  /** Honeypot. Filled in only by a bot; see `validateApplication`. */
  website: string;
};

export type Validated =
  | { ok: true; row: Insert }
  /** The honeypot tripped. Nothing should be written, and the caller should
   *  answer exactly as it would on success — telling a bot it was spotted
   *  only teaches whoever wrote it. */
  | { ok: true; row: null }
  | { ok: false; error: string };

/**
 * Length caps.
 *
 * Not a UI nicety: nothing stops a direct caller pasting a megabyte into
 * `motivation`, and Postgres `text` would take it. These are generous against
 * any real answer — a name is not 80 characters, and nobody explains why they
 * want to join in more than 2,000 — and they bound what one row can cost.
 */
export const MAX = {
  name: 80,
  email: 254, // the practical maximum length of an address, per RFC 5321
  phone: 32,
  short: 200,
  long: 2000,
} as const;

export const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Deliberately loose. The job is to catch a typo and a missing @, not to
 * adjudicate what is a valid address — the strict grammar in RFC 5322 rejects
 * addresses that work and accepts ones that do not, and the only real proof
 * an address exists is sending to it. The invitation email later is that
 * proof.
 */
export function looksLikeEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

type Bad = { error: string };
const failed = (v: unknown): v is Bad =>
  typeof v === "object" && v !== null && "error" in v;

/** A required free-text answer: present, and not longer than `max`. */
function text(value: string, label: string, max: number): string | Bad {
  const v = clean(value);
  if (!v) return { error: `${label} is required.` };
  if (v.length > max) return { error: `${label} is too long.` };
  return v;
}

/**
 * A question with a fixed list of answers, where the last option may be
 * "Other" and carries typed text.
 *
 * Returns what should be STORED: the option itself, or — when "Other" was
 * picked — the text that was typed. Storing the literal word "Other" would
 * record that we asked and learned nothing.
 */
function choice(
  value: string, other: string, options: readonly string[], label: string,
): string | Bad {
  const v = clean(value);
  if (!v) return { error: `${label} is required.` };
  if (!options.includes(v)) return { error: `${label} is not one of the options.` };
  if (v !== OTHER) return v;
  const typed = clean(other);
  if (!typed) return { error: `Please say which, under ${label.toLowerCase()}.` };
  if (typed.length > MAX.short) return { error: `${label} is too long.` };
  return typed;
}


/**
 * Put the dialling code and the typed number together into one dialable
 * string, or say why it cannot be done.
 *
 * The number is stored composed — "+44 7700900123" — rather than as two
 * columns, because every use of it is a person about to ring or message it.
 *
 * THE LEADING ZERO. Most countries use a trunk prefix of 0 domestically that
 * is DROPPED when dialling in from abroad: "07700 900123" is "+44 7700900123",
 * and keeping the 0 gives a number that does not connect. Italy is the
 * well-known exception — the 0 on an Italian landline is part of the number
 * in international form — so it is kept there and stripped everywhere else.
 *
 * This is not a substitute for a real parser. libphonenumber exists because
 * the full rules are enormous, and it is a big dependency for one field on
 * one form. The rule here is right for the overwhelming majority of what this
 * form will see, and a teacher reading a number can see what it is either way.
 */
function composePhone(raw: string, countryCode: string): string | Bad {
  const country = countryByCode(clean(countryCode) || DEFAULT_COUNTRY);
  if (!country) return { error: "Please choose the country for your phone number." };

  // Everything a person might type between the digits: spaces, dashes,
  // brackets, dots. A leading + is dropped too — the code in front supplies it.
  const digits = clean(raw).replace(/^\+/, "").replace(/[^0-9]/g, "");
  if (!digits) return { error: "Phone number is required." };
  if (digits.length < 5) return { error: "That phone number looks too short." };
  if (digits.length > 15) return { error: "That phone number looks too long." };

  const KEEPS_TRUNK_ZERO = new Set(["IT"]);
  const national = KEEPS_TRUNK_ZERO.has(country.cc)
    ? digits
    : digits.replace(/^0+/, "");
  if (!national) return { error: "That phone number looks wrong." };

  return `${country.dial} ${national}`;
}

/**
 * @param requirePaymentTick whether a payment link is set, and so whether the
 *   applicant was given anything to confirm having paid. With no link there is
 *   nothing to have done, and requiring the tick would be asking people to
 *   confirm something we never offered them a way to do.
 */
export function validateApplication(
  input: ApplicationInput, requirePaymentTick: boolean,
): Validated {
  // Honeypot: a field that is invisible and left empty by any human, and
  // filled in by the sort of bot that posts to every form it finds.
  if (clean(input.website)) return { ok: true, row: null };

  const firstName = text(input.firstName, "First name", MAX.name);
  if (failed(firstName)) return { ok: false, error: firstName.error };

  const surname = text(input.surname, "Surname", MAX.name);
  if (failed(surname)) return { ok: false, error: surname.error };

  // Lower-cased to match the unique index, which is on lower(email): stored
  // as typed, Someone@gmail.com and someone@gmail.com would both get in.
  const email = clean(input.email).toLowerCase();
  if (!email) return { ok: false, error: "Email address is required." };
  if (email.length > MAX.email || !looksLikeEmail(email)) {
    return { ok: false, error: "That email address doesn't look right." };
  }

  const phone = composePhone(input.phone, input.phoneCountry);
  if (failed(phone)) return { ok: false, error: phone.error };

  const section = sectionForGender(clean(input.gender));
  if (!section) return { ok: false, error: "Please choose an option for gender." };

  const university = choice(
    input.university, input.universityOther, UNIVERSITIES, "University",
  );
  if (failed(university)) return { ok: false, error: university.error };

  const year = choice(input.year, input.yearOther, YEARS, "Year");
  if (failed(year)) return { ok: false, error: year.error };

  const enrolled = clean(input.enrolledBefore);
  if (enrolled !== "yes" && enrolled !== "no") {
    return { ok: false, error: "Please say whether you've enrolled before." };
  }

  const memorised = text(input.memorised, "How much you've memorised", MAX.short);
  if (failed(memorised)) return { ok: false, error: memorised.error };

  const arabicReading = choice(input.arabicReading, "", ARABIC_READING, "Reading Arabic");
  if (failed(arabicReading)) return { ok: false, error: arabicReading.error };

  const tajweedLevel = choice(input.tajweedLevel, "", TAJWEED_LEVELS, "Tajweed level");
  if (failed(tajweedLevel)) return { ok: false, error: tajweedLevel.error };

  const heardFrom = choice(
    input.heardFrom, input.heardFromOther, HEARD_FROM, "Where you heard about us",
  );
  if (failed(heardFrom)) return { ok: false, error: heardFrom.error };

  const motivation = text(input.motivation, "What made you want to join", MAX.long);
  if (failed(motivation)) return { ok: false, error: motivation.error };

  if (requirePaymentTick && !input.paidConfirmed) {
    return { ok: false, error: "Please confirm you've read the terms and paid the fee." };
  }

  return {
    ok: true,
    row: {
      first_name: firstName,
      surname,
      email,
      phone,
      section,
      university,
      year_of_study: year,
      enrolled_before: enrolled === "yes",
      memorised,
      arabic_reading: arabicReading,
      tajweed_level: tajweedLevel,
      heard_from: heardFrom,
      motivation,
      fee_pence: FEE_PENCE,
      paid_confirmed: Boolean(input.paidConfirmed),
    },
  };
}
