"use client";

import { useId, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitApplication } from "@/lib/applications/actions";
import type { ApplicationInput } from "@/lib/applications/validate";
import {
  ARABIC_READING, GENDERS, HEARD_FROM, MOTIVATION_QUESTION, OTHER, PAYMENT_LINK,
  TAJWEED_LEVELS, UNIVERSITIES, YEARS, feeLabel, sectionForGender, termsFor,
} from "@/lib/applications/form";

/* ── Small building blocks ────────────────────────────────────────────── */

/**
 * One question.
 *
 * A `<fieldset>` with a `<legend>`, not a heading and a div — for a set of
 * radios that is the only markup that tells a screen reader which question
 * the options belong to, and every question on this form except the free-text
 * ones is a set of radios.
 */
function Question({
  label, hint, required = true, children,
}: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0 border-0 p-0">
      <legend className="mb-2 block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-danger" aria-hidden>*</span>}
        {!required && <span className="ml-2 text-xs text-muted-foreground">(optional)</span>}
      </legend>
      {hint && <p className="mb-2 -mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** A labelled text input. Uses a real <label for>, so the label is a hit target. */
function TextField({
  label, value, onChange, type = "text", autoComplete, required = true, maxLength, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; autoComplete?: string; required?: boolean; maxLength?: number; hint?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-danger" aria-hidden>*</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        spellCheck={type === "email" ? false : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * A radio list, with the "Other" text box folded in.
 *
 * The box only appears once "Other" is picked, and it is what gets stored —
 * `other` travels to the server as its own field so the server can tell an
 * offered option from typed text. See ApplicationInput.
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
      <RadioGroup value={value} onValueChange={(v) => onChange(String(v))}>
        {options.map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-start gap-3 text-sm leading-snug"
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
            id={otherId}
            value={other ?? ""}
            maxLength={200}
            required
            onChange={(e) => onOtherChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}

/* ── The form ─────────────────────────────────────────────────────────── */

const EMPTY: ApplicationInput = {
  firstName: "", surname: "", email: "", phone: "", gender: "",
  university: "", universityOther: "", year: "", yearOther: "",
  enrolledBefore: "", memorised: "", arabicReading: "", tajweedLevel: "",
  heardFrom: "", heardFromOther: "", motivation: "",
  paidConfirmed: false, website: "",
};

export function ApplyForm() {
  const [form, setForm] = useState<ApplicationInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // The terms differ by side, and the side comes from the gender answer — so
  // they can only be shown once that question is answered. Before then the
  // section below explains that rather than showing one side's days to
  // everybody, which is the mistake the old form made in reverse.
  const section = sectionForGender(form.gender);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await submitApplication(form);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      // The message is rendered just above the button, but a long form means
      // it can still be off screen on a phone if the browser kept the scroll
      // position — and a submit that appears to do nothing reads as broken.
      document.getElementById("apply-error")?.scrollIntoView({
        behavior: "smooth", block: "center",
      });
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <div className="box c12 items-start gap-4 py-10" role="status">
        <span
          className="flex size-10 items-center justify-center rounded-full bg-ok/15 text-ok"
          aria-hidden
        >
          <CheckIcon className="size-5" />
        </span>
        <div className="space-y-3">
          <h2 className="font-heading text-2xl">Your application is in.</h2>
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Jazākum Allāhu khayran. We&apos;ll email{" "}
            <b className="text-foreground">{form.email}</b> with an invitation to
            an online session where you&apos;ll read a short passage for us. That
            is how we hear where everyone is up to and put people into groups at
            the right level — it is not a test you can fail, and there is nothing
            to prepare.
          </p>
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Once groups are set we&apos;ll send you a login for the app, where
            your lessons, homework and hifdh tracking live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      {/* ── About you ── */}
      <section className="space-y-5">
        <h2 className="label">About you</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="First name" autoComplete="given-name" maxLength={80}
            value={form.firstName} onChange={(v) => set("firstName", v)}
          />
          <TextField
            label="Surname" autoComplete="family-name" maxLength={80}
            value={form.surname} onChange={(v) => set("surname", v)}
          />
          <TextField
            label="Email" type="email" autoComplete="email" maxLength={254}
            hint="This is where your invitation and your login will be sent."
            value={form.email} onChange={(v) => set("email", v)}
          />
          <TextField
            label="Phone number" type="tel" autoComplete="tel" maxLength={32}
            value={form.phone} onChange={(v) => set("phone", v)}
          />
        </div>

        <Question label="Gender" hint="The brothers and sisters are taught separately.">
          <Choices
            options={GENDERS.map((g) => g.label)}
            value={GENDERS.find((g) => g.value === form.gender)?.label ?? ""}
            onChange={(label) =>
              set("gender", GENDERS.find((g) => g.label === label)?.value ?? "")
            }
          />
        </Question>

        <div className="grid gap-5 sm:grid-cols-2">
          <Question label="University">
            <Choices
              options={UNIVERSITIES}
              value={form.university} onChange={(v) => set("university", v)}
              other={form.universityOther} onOtherChange={(v) => set("universityOther", v)}
              otherLabel="Which university?"
            />
          </Question>
          <Question label="Year">
            <Choices
              options={YEARS}
              value={form.year} onChange={(v) => set("year", v)}
              other={form.yearOther} onOtherChange={(v) => set("yearOther", v)}
              otherLabel="Which year?"
            />
          </Question>
        </div>
      </section>

      {/* ── Where you're up to ── */}
      <section className="space-y-5">
        <h2 className="label">Where you&apos;re up to</h2>

        <Question label="Have you enrolled into BSMS Tajweed before?">
          <Choices
            options={["Yes", "No"]}
            value={form.enrolledBefore === "yes" ? "Yes" : form.enrolledBefore === "no" ? "No" : ""}
            onChange={(v) => set("enrolledBefore", v === "Yes" ? "yes" : "no")}
          />
        </Question>

        <TextField
          label="How much Qur'an have you memorised?" maxLength={200}
          hint="However you'd say it — a few surahs, juz 'amma, five juz."
          value={form.memorised} onChange={(v) => set("memorised", v)}
        />

        <Question label="Can you read the Qur'an in Arabic?">
          <Choices
            options={ARABIC_READING}
            value={form.arabicReading} onChange={(v) => set("arabicReading", v)}
          />
        </Question>

        <Question
          label="What is your level when it comes to tajweed?"
          hint="Answer honestly — everyone is placed in a group by level, and there is a group for every answer here."
        >
          <Choices
            options={TAJWEED_LEVELS}
            value={form.tajweedLevel} onChange={(v) => set("tajweedLevel", v)}
          />
        </Question>
      </section>

      {/* ── Why ── */}
      <section className="space-y-5">
        <h2 className="label">Why you&apos;re applying</h2>

        <Question label="Where did you hear about BSMS Tajweed?">
          <Choices
            options={HEARD_FROM}
            value={form.heardFrom} onChange={(v) => set("heardFrom", v)}
            other={form.heardFromOther} onOtherChange={(v) => set("heardFromOther", v)}
            otherLabel="Where was that?"
          />
        </Question>

        <Question label={MOTIVATION_QUESTION}>
          <Textarea
            rows={4} maxLength={2000} required
            placeholder="A couple of sentences is plenty."
            value={form.motivation}
            onChange={(e) => set("motivation", e.target.value)}
          />
        </Question>
      </section>

      {/* ── The terms ── */}
      <section className="space-y-5">
        <h2 className="label">What you&apos;re agreeing to</h2>
        {section ? (
          <dl className="space-y-4">
            {termsFor(section).map((t) => (
              <div key={t.title} className="space-y-1">
                <dt className="text-sm font-medium">{t.title}</dt>
                <dd className="max-w-[62ch] text-sm text-muted-foreground">{t.body}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="max-w-[62ch] text-sm text-muted-foreground">
            Answer the gender question above and the terms for your side —
            including which evenings your classes run — will appear here.
          </p>
        )}
      </section>

      {/* ── The fee ── */}
      <section className="space-y-4">
        <h2 className="label">The {feeLabel()} fee</h2>
        {PAYMENT_LINK ? (
          <>
            <p className="max-w-[62ch] text-sm text-muted-foreground">
              {feeLabel()}{" "}once, for the whole year. Pay it before you send this
              form so we can match your payment to your application.
            </p>
            <a
              href={PAYMENT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex h-10 items-center rounded-md border border-line px-5 text-sm",
                "transition-colors hover:bg-foreground/5",
              )}
            >
              Pay {feeLabel()}{" "}→
            </a>
            <label className="flex cursor-pointer items-start gap-3 pt-1 text-sm leading-snug">
              <Checkbox
                checked={form.paidConfirmed}
                onCheckedChange={(v) => set("paidConfirmed", Boolean(v))}
                className="mt-0.5"
              />
              <span className="min-w-0 max-w-[62ch]">
                I understand and agree to these terms, and I have paid the{" "}
                {feeLabel()}{" "}fee through the link above.
                <span className="ml-1 text-danger" aria-hidden>*</span>
              </span>
            </label>
          </>
        ) : (
          /* No payment link is set yet. The fee is still stated up front — an
             applicant should never be surprised by it — but nobody is asked to
             tick that they have paid something they were never given a way to
             pay. Setting PAYMENT_LINK swaps this for the button and the tick. */
          <>
            <p className="max-w-[62ch] text-sm text-muted-foreground">
              {feeLabel()}{" "}once, for the whole year. We&apos;ll send you the
              payment details by email along with your invitation — there is
              nothing to pay right now.
            </p>
            <label className="flex cursor-pointer items-start gap-3 pt-1 text-sm leading-snug">
              <Checkbox
                checked={form.paidConfirmed}
                onCheckedChange={(v) => set("paidConfirmed", Boolean(v))}
                className="mt-0.5"
                required
              />
              <span className="min-w-0 max-w-[62ch]">
                I understand and agree to these terms, including the {feeLabel()}{" "}
                fee.
                <span className="ml-1 text-danger" aria-hidden>*</span>
              </span>
            </label>
          </>
        )}
      </section>

      {/* Honeypot. Hidden from sight AND from screen readers, never focusable,
          and outside the tab order — so no person can fill it in by accident,
          while a bot that fills every input it finds will. `display:none` on
          its own is skipped by some crawlers; this keeps it in the layout but
          out of reach. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="apply-website">Website</label>
        <input
          id="apply-website" name="website" type="text" tabIndex={-1}
          autoComplete="off"
          value={form.website} onChange={(e) => set("website", e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {/* aria-live so the message is announced when it appears, rather than
            being a silent colour change somewhere above the button. */}
        <p id="apply-error" role="alert" aria-live="polite" className="text-sm text-danger">
          {error}
        </p>
        <Button type="submit" size="lg" disabled={busy} className="w-full sm:w-auto sm:px-10">
          {busy ? "Sending…" : "Send my application"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Sending this does not create an account. We&apos;ll invite you to an
          online session to read for us first.
        </p>
      </div>
    </form>
  );
}
