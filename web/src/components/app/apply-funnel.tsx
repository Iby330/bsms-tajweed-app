"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CountrySelect } from "@/components/app/country-select";
import { DEFAULT_COUNTRY } from "@/lib/applications/countries";
import { BRAND_LOGO } from "@/lib/theme/brand";
import { fmtDay } from "@/lib/format";
import { TERMS } from "@/lib/attendance/calendar";
import { submitApplication } from "@/lib/applications/actions";
import type { ApplicationInput } from "@/lib/applications/validate";
import {
  ARABIC_READING, CLOSES_LABEL, GENDERS, HEARD_FROM, MOTIVATION_QUESTION, OPENING_VERSE,
  OTHER, PAYMENT_LINK, PROGRAMME_YEAR, TAJWEED_LEVELS, UNIVERSITIES, YEARS,
  feeLabel, sectionForGender, termsFor,
} from "@/lib/applications/form";

/**
 * The application, asked one question at a time.
 *
 * A single page of nineteen fields is the form people abandon: it shows all
 * of its length at once, before anyone has invested anything in it. Asking
 * one thing at a time shows only the next small step, and the progress bar
 * turns the remaining length from a wall into a countdown. It also lets each
 * question be answered on a phone without scrolling, which is where most of
 * these will be filled in — the link goes out on WhatsApp.
 *
 * Three things that matter more than they look:
 *
 *  · Choice questions ADVANCE THEMSELVES, but only the first time they are
 *    answered. That is what makes the run through feel quick; suppressing it
 *    on a revisit is what stops the form yanking somebody forward when they
 *    came back to change an answer.
 *  · Every answer is kept when you go back. Nothing is submitted until the
 *    last step, so Back is free and the whole thing is one server round trip.
 *  · Validation here is a convenience. The server re-checks everything, and
 *    is the only thing standing between the public and the table.
 */

/* ── The steps ────────────────────────────────────────────────────────── */

type StepId =
  | "gender" | "name" | "email" | "phone" | "university" | "year" | "before"
  | "memorised" | "arabic" | "tajweed" | "heard" | "why" | "terms";

type Step = {
  id: StepId;
  /** The question, as asked. */
  title: string;
  hint?: string;
  /** null once the step holds an answer good enough to move on from. */
  validate: (f: ApplicationInput) => string | null;
  /** Choice steps move on by themselves; typed ones wait for Next. */
  autoAdvance?: boolean;
};

const need = (v: string, msg: string) => (v.trim() ? null : msg);

/**
 * Deliberately loose, and the same expression the server uses: the job is to
 * catch a typo and a missing @, not to adjudicate RFC 5322.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A choice question whose "Other" option needs its box filled in too. */
const choiceWithOther = (
  value: string, other: string, msg: string,
): string | null =>
  !value.trim() ? msg : value === OTHER && !other.trim() ? "Please fill in the box." : null;

const STEPS: Step[] = [
  {
    id: "gender",
    title: "Are you a brother or a sister?",
    hint: "The two sides are taught separately, so this decides which classes you're applying to.",
    autoAdvance: true,
    validate: (f) => (sectionForGender(f.gender) ? null : "Please choose one."),
  },
  {
    id: "name",
    title: "What's your name?",
    validate: (f) =>
      need(f.firstName, "Please put your first name.") ?? need(f.surname, "Please put your surname."),
  },
  {
    id: "email",
    title: "What's your email address?",
    hint: "Your invitation to the recitation session and, later, your login both go here.",
    validate: (f) =>
      !f.email.trim()
        ? "Please put your email address."
        : EMAIL_RE.test(f.email.trim())
          ? null
          : "That doesn't look like an email address.",
  },
  {
    id: "phone",
    title: "And your phone number?",
    hint: "Pick your country's code, then the rest of the number. This is how we reach you on WhatsApp about the session.",
    validate: (f) => {
      if (!f.phone.trim()) return "Please put your phone number.";
      // Counted rather than length-checked, because people type spaces,
      // dashes and brackets and none of those are the number.
      const digits = f.phone.replace(/[^0-9]/g, "");
      if (digits.length < 5) return "That number looks too short.";
      if (digits.length > 15) return "That number looks too long.";
      return null;
    },
  },
  {
    id: "university",
    title: "Which university are you at?",
    autoAdvance: true,
    validate: (f) => choiceWithOther(f.university, f.universityOther, "Please choose one."),
  },
  {
    id: "year",
    title: "Which year are you in?",
    autoAdvance: true,
    validate: (f) => choiceWithOther(f.year, f.yearOther, "Please choose one."),
  },
  {
    id: "before",
    title: "Have you been on BSMS Tajweed before?",
    autoAdvance: true,
    validate: (f) =>
      f.enrolledBefore === "yes" || f.enrolledBefore === "no" ? null : "Please choose one.",
  },
  {
    id: "memorised",
    title: "How much Qur'an have you memorised?",
    hint: "However you'd say it — a few surahs, juz 'amma, five juz. There's no wrong answer.",
    validate: (f) => need(f.memorised, "Please put something, even if it's 'none yet'."),
  },
  {
    id: "arabic",
    title: "Can you read the Qur'an in Arabic?",
    autoAdvance: true,
    validate: (f) => need(f.arabicReading, "Please choose one."),
  },
  {
    id: "tajweed",
    title: "What's your level when it comes to tajweed?",
    hint: "Answer honestly — everyone is placed in a group by level, and there's a group for every answer here.",
    autoAdvance: true,
    validate: (f) => need(f.tajweedLevel, "Please choose one."),
  },
  {
    id: "heard",
    title: "Where did you hear about BSMS Tajweed?",
    autoAdvance: true,
    validate: (f) => choiceWithOther(f.heardFrom, f.heardFromOther, "Please choose one."),
  },
  {
    id: "why",
    title: MOTIVATION_QUESTION,
    hint: "A couple of sentences is plenty.",
    validate: (f) => need(f.motivation, "Please tell us a little about why."),
  },
  {
    id: "terms",
    title: "Last thing — what you're agreeing to",
    validate: (f) => (f.paidConfirmed ? null : "Please tick to confirm you've read the terms."),
  },
];

const EMPTY: ApplicationInput = {
  firstName: "", surname: "", email: "", phone: "", phoneCountry: DEFAULT_COUNTRY, gender: "",
  university: "", universityOther: "", year: "", yearOther: "",
  enrolledBefore: "", memorised: "", arabicReading: "", tajweedLevel: "",
  heardFrom: "", heardFromOther: "", motivation: "",
  paidConfirmed: false, website: "",
};

/* ── Pieces ───────────────────────────────────────────────────────────── */

/**
 * A radio list, with the "Other" box folded in.
 *
 * Each option is a full-width card rather than a dot with a label beside it.
 * On a phone the dot alone is a ~16px target; the whole row is the thing
 * people actually aim at, so the whole row is the control.
 */
function Choices({
  options, value, onChange, other, onOtherChange, otherLabel = "Please say which",
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  other?: string;
  onOtherChange?: (v: string) => void;
  otherLabel?: string;
}) {
  const otherId = useId();
  return (
    <div className="space-y-2">
      <RadioGroup value={value} onValueChange={(v) => onChange(String(v))} className="gap-2">
        {options.map((opt) => (
          <label
            key={opt}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-snug",
              "transition-colors hover:bg-foreground/[0.03]",
              value === opt ? "border-primary bg-primary/[0.06]" : "border-line",
            )}
          >
            <RadioGroupItem value={opt} className="mt-0.5" />
            <span className="min-w-0">{opt}</span>
          </label>
        ))}
      </RadioGroup>
      {value === OTHER && onOtherChange && (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor={otherId} className="text-xs text-muted-foreground">
            {otherLabel}
          </Label>
          <Input
            id={otherId} value={other ?? ""} maxLength={200} autoFocus
            onChange={(e) => onOtherChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The page's own header, which SHRINKS once the funnel starts.
 *
 * On the opening screen it is the full masthead — this is a page somebody has
 * just been sent a link to, and it has to say whose it is. From the first
 * question on it collapses to a single line, because the point of asking one
 * question at a time is that the question fills the screen; on a phone the
 * full masthead was pushing every question a third of the way down it.
 */
function FunnelHeader({ big }: { big: boolean }) {
  if (big) {
    return (
      <header className="masthead pb-8">
        <Link href="/" aria-label="BSMS Tajweed home">
          <Image
            src={BRAND_LOGO} alt="BSMS Tajweed" width={80} height={80}
            className="mb-8 rounded-2xl" priority
          />
        </Link>
        <h1>
          <span>Apply to</span>
          <br />
          <b>BSMS Tajweed.</b>
        </h1>
      </header>
    );
  }
  return (
    <header className="flex items-center gap-3 py-6">
      <Image
        src={BRAND_LOGO} alt="" width={32} height={32} className="rounded-lg" aria-hidden
      />
      <span className="font-heading text-sm tracking-tight">BSMS Tajweed</span>
      <span className="sr-only">— application</span>
    </header>
  );
}

/* ── The funnel ───────────────────────────────────────────────────────── */

/** -1 is the opening screen; 0…n-1 are the questions. */
const INTRO = -1;

export function ApplyFunnel() {
  const [form, setForm] = useState<ApplicationInput>(EMPTY);
  const [i, setI] = useState(INTRO);
  const [seen, setSeen] = useState<ReadonlySet<StepId>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [back, setBack] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number | null>(null);

  const step: Step | undefined = i >= 0 ? STEPS[i] : undefined;
  const section = sectionForGender(form.gender);

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  // Move focus to the question when the step changes, so a screen reader
  // announces the new question rather than leaving the user on a button that
  // has just been replaced. Not on the intro, where nothing has moved yet.
  useEffect(() => {
    if (i >= 0) headingRef.current?.focus();
  }, [i]);

  const set = useCallback(
    <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
      setError(null);
    },
    [],
  );

  const goTo = (next: number, goingBack = false) => {
    clearTimer();
    setBack(goingBack);
    setError(null);
    setI(next);
  };

  /**
   * Validate step `at` against `f`, then move on or submit.
   *
   * The index is passed in rather than read from a ref, because the only two
   * callers both know it: the form's submit handler runs with the rendered
   * `i`, and auto-advance captures `i` at the moment of the click. A stale
   * timeout cannot act on the wrong step anyway — `goTo` clears it.
   */
  const advance = useCallback(async (f: ApplicationInput, at: number) => {
    const current = STEPS[at];
    if (!current) return;

    const problem = current.validate(f);
    if (problem) { setError(problem); return; }

    setSeen((s) => new Set(s).add(current.id));

    if (at < STEPS.length - 1) { clearTimer(); setBack(false); setError(null); setI(at + 1); return; }

    setBusy(true);
    const result = await submitApplication(f);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /**
   * Answer a choice question.
   *
   * `canAdvance` is false for "Other", which still needs its box filling in —
   * moving on the instant it is picked would skip the only part that carries
   * any information.
   */
  const choose = (patch: Partial<ApplicationInput>, canAdvance: boolean) => {
    const next = { ...form, ...patch };
    setForm(next);
    setError(null);
    if (!step?.autoAdvance || !canAdvance || seen.has(step.id)) return;
    clearTimer();
    // Long enough that the option is visibly selected before the screen
    // changes — instant would read as a glitch rather than a choice landing.
    const at = i;
    timer.current = window.setTimeout(() => void advance(next, at), 280);
  };

  /* ── Done ── */
  if (done) {
    return (
      <>
      <FunnelHeader big={false} />
      <div className="mx-auto max-w-xl py-10 text-center" role="status">
        <span
          className="mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-ok/15 text-ok"
          aria-hidden
        >
          <CheckIcon className="size-6" />
        </span>
        <h2 className="font-heading text-3xl">Your application is in.</h2>
        <div className="mt-5 space-y-4 text-left text-sm text-muted-foreground">
          <p>
            Jazākum Allāhu khayran. We&apos;ll email{" "}
            <b className="text-foreground">{form.email}</b> with an invitation to an
            online session where you&apos;ll read a short passage for us. That is how
            we hear where everyone is up to and put people into groups at the right
            level — it is not a test you can fail, and there is nothing to prepare.
          </p>
          <p>
            Once groups are set we&apos;ll send you a login for the app, where your
            lessons, homework and hifdh tracking live.
          </p>
        </div>
      </div>
      </>
    );
  }

  /* ── Intro ── */
  if (i === INTRO) {
    return (
      <>
      <FunnelHeader big />
      <div className="mx-auto max-w-2xl">
        <div className="classverse">
          <p className="ar" dir="rtl" lang="ar">{OPENING_VERSE.ar}</p>
          <p className="en">
            {OPENING_VERSE.en}
            <span className="src mt-1 text-xs">{OPENING_VERSE.source}</span>
          </p>
        </div>

        <p className="mt-6 text-muted-foreground">
          Alḥamdulillāh, for our {PROGRAMME_YEAR}{" "}year we are opening the course
          again: weekly tajweed classes, hifdh with a teacher who knows what
          you&apos;re working on, and an app that keeps your lessons, homework and
          memorisation in one place. Open to students at BSMS, Brighton and
          Sussex — and to alumni.
        </p>

        <div className="mt-8 rounded-xl border border-line p-5">
          <h2 className="label">How this works</h2>
          <ol className="mt-4 space-y-4">
            {[
              ["You answer a few questions",
                `Under two minutes. Applications close ${CLOSES_LABEL}.`],
              ["We invite you to read for us",
                "A short online session where you recite a passage. It is not a test and there is nothing to revise — we just need to hear where you are up to. Brothers and sisters hold theirs separately."],
              ["You're placed in a group",
                "Groups are set by what we hear, so everyone is with people working at the same level. There is a group for complete beginners, including if you don't yet know the alphabet."],
              ["You get your login",
                `Once groups are set we email you an account for the app, and classes begin on ${fmtDay(TERMS[0].startsOn)}.`],
            ].map(([title, body], n) => (
              <li key={title} className="flex gap-4">
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs tabular-nums text-muted-foreground"
                  aria-hidden
                >
                  {n + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <Button size="lg" className="mt-8 w-full sm:w-auto sm:px-12" onClick={() => goTo(0)}>
          Start my application
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          {STEPS.length} questions · {feeLabel()} for the year · closes {CLOSES_LABEL}
        </p>
      </div>
      </>
    );
  }

  /* ── A question ── */
  const progress = ((i + 1) / STEPS.length) * 100;

  return (
    <>
    <FunnelHeader big={false} />
    <div className="mx-auto max-w-2xl">
      {/* Progress. The bar is aria-hidden and the count beside it carries the
          same fact as text, because a bar announced as a percentage tells a
          screen-reader user nothing about how many questions are left. */}
      <div className="mb-8">
        <div className="mb-2 flex items-baseline justify-between">
          <button
            type="button"
            onClick={() => goTo(i - 1, true)}
            className="-ml-1 flex items-center gap-1 rounded p-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back
          </button>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {i + 1} of {STEPS.length}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void advance(form, i); }}
        // Keyed on the step so each question animates in as its own thing.
        key={step!.id}
        className={cn(
          "animate-in fade-in-0 duration-300",
          back ? "slide-in-from-left-4" : "slide-in-from-right-4",
        )}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl leading-tight outline-none sm:text-3xl"
        >
          {step!.title}
        </h2>
        {step!.hint && (
          <p className="mt-3 max-w-[52ch] text-sm text-muted-foreground">{step!.hint}</p>
        )}

        <div className="mt-7">
          {step!.id === "gender" && (
            <Choices
              options={GENDERS.map((g) => g.label)}
              value={GENDERS.find((g) => g.value === form.gender)?.label ?? ""}
              onChange={(label) =>
                choose({ gender: GENDERS.find((g) => g.label === label)?.value ?? "" }, true)
              }
            />
          )}

          {step!.id === "name" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-first">First name</Label>
                <Input
                  id="f-first" autoComplete="given-name" maxLength={80} autoFocus
                  value={form.firstName} onChange={(e) => set("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-last">Surname</Label>
                <Input
                  id="f-last" autoComplete="family-name" maxLength={80}
                  value={form.surname} onChange={(e) => set("surname", e.target.value)}
                />
              </div>
            </div>
          )}

          {step!.id === "email" && (
            <Input
              type="email" autoComplete="email" maxLength={254} spellCheck={false} autoFocus
              aria-label="Email address"
              value={form.email} onChange={(e) => set("email", e.target.value)}
            />
          )}

          {step!.id === "phone" && (
            <div className="flex items-start gap-2">
              <CountrySelect
                value={form.phoneCountry}
                onChange={(cc) => set("phoneCountry", cc)}
              />
              <Input
                type="tel" inputMode="tel" autoComplete="tel-national"
                maxLength={32} autoFocus className="flex-1"
                aria-label="Phone number, without the country code"
                placeholder="7700 900123"
                value={form.phone} onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          )}

          {step!.id === "university" && (
            <Choices
              options={UNIVERSITIES} value={form.university}
              onChange={(v) => choose({ university: v }, v !== OTHER)}
              other={form.universityOther}
              onOtherChange={(v) => set("universityOther", v)}
              otherLabel="Which university?"
            />
          )}

          {step!.id === "year" && (
            <Choices
              options={YEARS} value={form.year}
              onChange={(v) => choose({ year: v }, v !== OTHER)}
              other={form.yearOther}
              onOtherChange={(v) => set("yearOther", v)}
              otherLabel="Which year?"
            />
          )}

          {step!.id === "before" && (
            <Choices
              options={["Yes", "No"]}
              value={form.enrolledBefore === "yes" ? "Yes" : form.enrolledBefore === "no" ? "No" : ""}
              onChange={(v) => choose({ enrolledBefore: v === "Yes" ? "yes" : "no" }, true)}
            />
          )}

          {step!.id === "memorised" && (
            <Input
              maxLength={200} autoFocus aria-label="How much you have memorised"
              placeholder="e.g. juz 'amma and Al-Mulk"
              value={form.memorised} onChange={(e) => set("memorised", e.target.value)}
            />
          )}

          {step!.id === "arabic" && (
            <Choices
              options={ARABIC_READING} value={form.arabicReading}
              onChange={(v) => choose({ arabicReading: v }, true)}
            />
          )}

          {step!.id === "tajweed" && (
            <Choices
              options={TAJWEED_LEVELS} value={form.tajweedLevel}
              onChange={(v) => choose({ tajweedLevel: v }, true)}
            />
          )}

          {step!.id === "heard" && (
            <Choices
              options={HEARD_FROM} value={form.heardFrom}
              onChange={(v) => choose({ heardFrom: v }, v !== OTHER)}
              other={form.heardFromOther}
              onOtherChange={(v) => set("heardFromOther", v)}
              otherLabel="Where was that?"
            />
          )}

          {step!.id === "why" && (
            <Textarea
              rows={5} maxLength={2000} autoFocus aria-label={MOTIVATION_QUESTION}
              placeholder="A couple of sentences is plenty."
              value={form.motivation} onChange={(e) => set("motivation", e.target.value)}
            />
          )}

          {step!.id === "terms" && (
            <div className="space-y-6">
              <dl className="space-y-4 rounded-xl border border-line p-5">
                {termsFor(section ?? "brothers").map((t) => (
                  <div key={t.title} className="space-y-1">
                    <dt className="text-sm font-medium">{t.title}</dt>
                    <dd className="text-sm text-muted-foreground">{t.body}</dd>
                  </div>
                ))}
              </dl>

              {PAYMENT_LINK ? (
                <div className="space-y-3">
                  <a
                    href={PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                    className={cn(
                      "inline-flex h-10 items-center rounded-md border border-line px-5 text-sm",
                      "transition-colors hover:bg-foreground/5",
                    )}
                  >
                    Pay {feeLabel()}{" "}→
                  </a>
                  <p className="text-xs text-muted-foreground">
                    Pay before you send this, so we can match your payment to your
                    application.
                  </p>
                </div>
              ) : (
                /* No payment link is set. The fee is still stated in the terms
                   above — nobody should be surprised by it — but nobody is
                   asked to confirm paying something they were never given a
                   way to pay. */
                <p className="text-sm text-muted-foreground">
                  We&apos;ll send you the payment details by email along with your
                  invitation. There&apos;s nothing to pay right now.
                </p>
              )}

              <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
                <Checkbox
                  checked={form.paidConfirmed}
                  onCheckedChange={(v) => set("paidConfirmed", Boolean(v))}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  I understand and agree to these terms
                  {PAYMENT_LINK ? `, and I have paid the ${feeLabel()} fee.` : "."}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Honeypot. Hidden from sight and from screen readers, out of the tab
            order — no person fills it in, and a bot that fills every input it
            finds will. */}
        <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="apply-website">Website</label>
          <input
            id="apply-website" name="website" type="text" tabIndex={-1} autoComplete="off"
            value={form.website} onChange={(e) => set("website", e.target.value)}
          />
        </div>

        <p role="alert" aria-live="polite" className="mt-5 min-h-5 text-sm text-danger">
          {error}
        </p>

        <div className="mt-2 flex items-center gap-4">
          <Button type="submit" size="lg" disabled={busy} className="px-10">
            {busy
              ? "Sending…"
              : i === STEPS.length - 1
                ? "Send my application"
                : "Next"}
          </Button>
          {i < STEPS.length - 1 && (
            <span className="text-xs text-muted-foreground">or press Enter</span>
          )}
        </div>

        {i === STEPS.length - 1 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Sending this does not create an account. We&apos;ll invite you to an
            online session to read for us first.
          </p>
        )}
      </form>
    </div>
    </>
  );
}
