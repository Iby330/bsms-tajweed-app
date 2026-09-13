import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ApplyForm } from "@/components/app/apply-form";
import { BRAND_LOGO } from "@/lib/theme/brand";
import { OPENING_VERSE, PROGRAMME_YEAR, feeLabel } from "@/lib/applications/form";
import { TERMS } from "@/lib/attendance/calendar";
import { fmtDay } from "@/lib/format";

/**
 * The public application form.
 *
 * The one page in this app written for people who are not in it yet, and the
 * only route reachable signed out besides the splash and the auth screens
 * (see PUBLIC_PATHS in proxy.ts). It replaces the Google Form that ran the
 * previous four intakes.
 *
 * It creates NO account. An application is a person asking to join; they are
 * invited to an online session, they recite, they are placed in a group by
 * level, and the existing invitation flow is still the only thing that makes
 * a login. That sequence is spelled out twice on the page — in "How this
 * works" and again on the confirmation — because the single most likely
 * misunderstanding is that sending the form is enrolment.
 */

/**
 * The link goes out on WhatsApp and Instagram, so the preview card IS the
 * advert — for most people it is the entire first impression, seen before
 * anyone taps through. `openGraph` gives it the wordmark and a sentence that
 * says what the programme is and what it costs, rather than letting WhatsApp
 * fall back to a bare domain and a favicon.
 */
export const metadata: Metadata = {
  title: "Apply",
  description:
    `Applications are open for BSMS Tajweed — tajweed and Qur'an memorisation for `
    + `Brighton, Sussex and BSMS students. ${feeLabel()} for the year.`,
  openGraph: {
    title: "Apply — BSMS Tajweed",
    description:
      `Tajweed and Qur'an memorisation for Brighton, Sussex and BSMS students. `
      + `${feeLabel()} for the year. Applications are open.`,
    url: "/apply",
    siteName: "BSMS Tajweed",
    images: [{ url: BRAND_LOGO, width: 1200, height: 630, alt: "BSMS Tajweed" }],
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

/** One numbered step in "How this works". */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs tabular-nums text-muted-foreground"
        aria-hidden
      >
        {n}
      </span>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="max-w-[58ch] text-sm text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}

export default function Apply() {
  return (
    <div className="shellview">
      <header className="masthead">
        <Link href="/" aria-label="BSMS Tajweed home">
          <Image
            src={BRAND_LOGO}
            alt="BSMS Tajweed"
            width={96}
            height={96}
            className="mb-8 rounded-2xl"
            priority
          />
        </Link>
        <h1>
          <span>Apply to</span>
          <br />
          <b>BSMS Tajweed.</b>
        </h1>

        {/* The verse the previous four intakes' form opened with. Set in the
            same two-language block the class mastheads use. */}
        <div className="classverse">
          <p className="ar" dir="rtl" lang="ar">{OPENING_VERSE.ar}</p>
          <p className="en">
            {OPENING_VERSE.en}
            <span className="src mt-1 text-xs">{OPENING_VERSE.source}</span>
          </p>
        </div>

        <p>
          Alḥamdulillāh, for our {PROGRAMME_YEAR}{" "}year we are opening the course
          again: weekly tajweed classes, hifdh with a teacher who knows what
          you&apos;re working on, and an app that keeps your lessons, homework and
          memorisation in one place. Open to students at BSMS, Brighton and
          Sussex — and to alumni.
        </p>
      </header>

      <div className="divider" aria-hidden>
        <span className="r" /><span className="m" /><span className="r" />
      </div>

      <section className="space-y-5">
        <h2 className="label">How this works</h2>
        <ol className="space-y-5">
          <Step n={1} title="You send this form">
            It takes a couple of minutes. Applications close before the year
            starts on {fmtDay(TERMS[0].startsOn)}.
          </Step>
          <Step n={2} title="We invite you to read for us">
            A short online session where you recite a passage. It is not a test
            and there is nothing to revise — we just need to hear where you are
            up to. Brothers and sisters hold theirs separately.
          </Step>
          <Step n={3} title="You&apos;re placed in a group">
            Groups are set by what we hear, so everyone is with people working at
            the same level. There is a group for complete beginners, including if
            you don&apos;t yet know the alphabet.
          </Step>
          <Step n={4} title="You get your login">
            Once groups are set we email you an account for the app, and classes
            begin.
          </Step>
        </ol>
      </section>

      <div className="divider" aria-hidden>
        <span className="r" /><span className="m" /><span className="r" />
      </div>

      <ApplyForm />

      <footer className="mt-16 border-t border-line pt-6">
        <p className="text-xs text-muted-foreground">
          Already on the course?{" "}
          <Link href="/login" className="underline underline-offset-2">
            Sign in
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
