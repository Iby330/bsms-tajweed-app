import { describe, expect, it } from "vitest";
import { validateApplication, type ApplicationInput } from "./validate";
import {
  CLOSES_LABEL, FEE_PENCE, HEARD_FROM, OPENING_VERSE, OTHER, SIGNUPS_CLOSE,
  TAJWEED_LEVELS, UNIVERSITIES, YEARS, signupsOpen, termsFor,
} from "./form";
import { SISTERS_HIFDH_DAY_PROVISIONAL } from "@/lib/attendance/calendar";

/**
 * The public form's input is checked here and nowhere else that matters.
 *
 * `submitApplication` is a server action, which is a public HTTP endpoint:
 * anyone can post to it directly with no browser and no form, so `required`
 * in the markup stops nobody. These tests are the standing proof that the
 * server still refuses what it should — including the part that is easy to
 * lose in a refactor, which is that a caller cannot set the teacher's columns.
 */

const GOOD: ApplicationInput = {
  firstName: "Bilal",
  surname: "Ahmed",
  email: "Bilal.Ahmed@Sussex.ac.uk",
  phone: "07700 900123",
  gender: "male",
  university: "Sussex",
  universityOther: "",
  year: "2",
  yearOther: "",
  enrolledBefore: "no",
  memorised: "Juz 'amma",
  arabicReading: "Yes but I am not that quick",
  tajweedLevel: TAJWEED_LEVELS[1],
  heardFrom: "Instagram",
  heardFromOther: "",
  motivation: "I want to read properly in salah.",
  paidConfirmed: true,
  website: "",
};

const ok = (r: ReturnType<typeof validateApplication>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.row;
};

describe("a good application", () => {
  it("is accepted", () => {
    expect(ok(validateApplication(GOOD, true))).not.toBeNull();
  });

  it("lower-cases the email, so the unique index on lower(email) can do its job", () => {
    expect(ok(validateApplication(GOOD, true))?.email).toBe("bilal.ahmed@sussex.ac.uk");
  });

  it("turns the gender answer into a side", () => {
    expect(ok(validateApplication(GOOD, true))?.section).toBe("brothers");
    expect(ok(validateApplication({ ...GOOD, gender: "female" }, true))?.section)
      .toBe("sisters");
  });

  it("records what this intake was asked to pay", () => {
    expect(ok(validateApplication(GOOD, true))?.fee_pence).toBe(FEE_PENCE);
  });

  it("trims whitespace rather than storing it", () => {
    const row = ok(validateApplication({ ...GOOD, firstName: "  Bilal  " }, true));
    expect(row?.first_name).toBe("Bilal");
  });
});

describe("what the row may contain", () => {
  /**
   * The security property, stated as a test: an applicant supplies their own
   * answers and nothing else. If a later change starts passing the input
   * through wholesale, this fails.
   */
  it("never carries a status, class, note or fee-settled flag", () => {
    const row = ok(validateApplication(GOOD, true)) as Record<string, unknown>;
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("class_id");
    expect(row).not.toHaveProperty("notes");
    expect(row).not.toHaveProperty("fee_settled");
    expect(row).not.toHaveProperty("assessed_level");
    expect(row).not.toHaveProperty("reviewed_by");
  });
});

describe("answers that were never offered", () => {
  it("rejects a tajweed level that is not one of the four", () => {
    const r = validateApplication({ ...GOOD, tajweedLevel: "I am basically Ḥafṣ" }, true);
    expect(r.ok).toBe(false);
  });

  it("rejects a university that is not on the list", () => {
    expect(validateApplication({ ...GOOD, university: "Cambridge" }, true).ok).toBe(false);
  });

  it("rejects a made-up section by way of a made-up gender", () => {
    expect(validateApplication({ ...GOOD, gender: "demo" }, true).ok).toBe(false);
  });
});

describe('the "Other" boxes', () => {
  it("stores what was typed, not the word Other", () => {
    const row = ok(validateApplication(
      { ...GOOD, university: OTHER, universityOther: "Chichester" }, true,
    ));
    expect(row?.university).toBe("Chichester");
  });

  it("refuses Other with nothing typed", () => {
    const r = validateApplication({ ...GOOD, university: OTHER, universityOther: " " }, true);
    expect(r.ok).toBe(false);
  });

  it("holds for every list that offers one", () => {
    for (const list of [UNIVERSITIES, YEARS, HEARD_FROM]) {
      expect(list[list.length - 1]).toBe(OTHER);
    }
  });
});

describe("required answers", () => {
  it.each([
    ["firstName", ""],
    ["surname", "   "],
    ["phone", ""],
    ["memorised", ""],
    ["motivation", ""],
    ["arabicReading", ""],
    ["heardFrom", ""],
    ["enrolledBefore", "maybe"],
  ] as const)("refuses a missing %s", (field, value) => {
    expect(validateApplication({ ...GOOD, [field]: value }, true).ok).toBe(false);
  });

  it.each([
    "no-at-sign",
    "two@@at.com",
    "spaces in@it.com",
    "missing@tld",
    "",
  ])("refuses %o as an email", (email) => {
    expect(validateApplication({ ...GOOD, email }, true).ok).toBe(false);
  });
});

describe("length caps", () => {
  it("refuses a motivation longer than the cap", () => {
    const r = validateApplication({ ...GOOD, motivation: "x".repeat(2001) }, true);
    expect(r.ok).toBe(false);
  });

  it("accepts one exactly at the cap", () => {
    expect(validateApplication({ ...GOOD, motivation: "x".repeat(2000) }, true).ok).toBe(true);
  });

  it("refuses an absurd name", () => {
    expect(validateApplication({ ...GOOD, firstName: "x".repeat(81) }, true).ok).toBe(false);
  });
});

describe("the payment tick", () => {
  it("is required when a payment link is set", () => {
    expect(validateApplication({ ...GOOD, paidConfirmed: false }, true).ok).toBe(false);
  });

  it("is not required when there is no link to have paid through", () => {
    expect(validateApplication({ ...GOOD, paidConfirmed: false }, false).ok).toBe(true);
  });
});

describe("the honeypot", () => {
  /**
   * Both halves matter. Writing nothing is the point; answering as though it
   * worked is what stops whoever wrote the bot from learning that the field
   * is what caught them.
   */
  it("writes nothing but reports success", () => {
    const r = validateApplication({ ...GOOD, website: "http://spam.example" }, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row).toBeNull();
  });

  it("does not trip on an empty or whitespace value", () => {
    expect(ok(validateApplication({ ...GOOD, website: "   " }, true))).not.toBeNull();
  });
});

describe("the terms shown to applicants", () => {
  it("states the current fee", () => {
    const fee = termsFor("brothers").find((t) => t.title === "The fee");
    expect(fee?.body).toContain(`£${FEE_PENCE / 100}`);
  });

  it("names the brothers' real teaching days", () => {
    const when = termsFor("brothers").find((t) => t.title === "When classes run")?.body ?? "";
    expect(when).toContain("Monday");
    expect(when).toContain("Thursday");
  });

  /**
   * The sisters' hifdh evening is a placeholder in SECTION_TIMETABLES, settled
   * per class each September. This page is public and read by people deciding
   * whether they can commit, so it must not print a guess as a fact.
   */
  it("does not name a sisters' hifdh evening while it is provisional", () => {
    if (!SISTERS_HIFDH_DAY_PROVISIONAL) return;
    const when = termsFor("sisters").find((t) => t.title === "When classes run")?.body ?? "";
    expect(when).toContain("Wednesday");
    expect(when).toContain("confirmed before term starts");
    expect(when).not.toContain("Monday");
  });
});

describe("the opening verse", () => {
  /**
   * Uthmanic Hafs mis-places U+0670 when it follows U+0640, setting the
   * dagger alif past the letter after the one it lengthens. Al-Isrā' 17:9
   * carries three of them, so the carrier is stripped — the same deviation
   * from QUL that the class verses make, and for the same reason.
   */
  it("carries no tatweel, and keeps all three dagger alifs", () => {
    expect(OPENING_VERSE.ar).not.toContain("ـ");
    expect(OPENING_VERSE.ar.split("ٰ").length - 1).toBe(3);
  });
});

describe("the closing deadline", () => {
  /**
   * The instant and the words shown to applicants are written separately —
   * the instant so a server and a phone in another zone agree to the minute,
   * the words so an American browser is not told "9/30/2026". This holds the
   * two to each other, so changing the date and forgetting the label, or
   * getting the BST offset wrong, fails here rather than in the intake.
   */
  it("is the Wednesday and the time the label says, in London", () => {
    const london = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(SIGNUPS_CLOSE);
    expect(london).toContain("Wednesday");
    expect(london).toContain("30 September 2026");
    expect(london).toContain("14:00");
    expect(CLOSES_LABEL).toBe("Wednesday 30 September at 2pm");
  });

  it("is open a minute before and shut on the minute", () => {
    const t = SIGNUPS_CLOSE.getTime();
    expect(signupsOpen(new Date(t - 60_000))).toBe(true);
    // Shut AT the deadline, not a millisecond after: "closes at 2pm" means
    // 2pm is too late, which is how anybody reading it would take it.
    expect(signupsOpen(new Date(t))).toBe(false);
    expect(signupsOpen(new Date(t + 60_000))).toBe(false);
  });
});
