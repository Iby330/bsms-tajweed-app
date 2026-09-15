import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ApplyFunnel } from "@/components/app/apply-funnel";
import { BRAND_LOGO } from "@/lib/theme/brand";
import { CLOSES_LABEL, feeLabel, signupsOpen } from "@/lib/applications/form";

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
 * a login. That sequence is spelled out twice — in "How this works" on the
 * opening screen and again on the confirmation — because the single most
 * likely misunderstanding is that sending the form is enrolment.
 */

/**
 * Rendered per request, not prerendered, because the page has a DEADLINE and
 * a statically built copy would go on inviting applications after it passed.
 * The gate below is only the courtesy half of that: `submitApplication`
 * refuses a late write on the server, which is what actually holds when the
 * page is sitting open in a tab from this morning.
 */
export const dynamic = "force-dynamic";

/**
 * The link goes out on WhatsApp and Instagram, so the preview card IS the
 * advert — for most people it is the entire first impression, seen before
 * anyone taps through. `openGraph` gives it the wordmark and a sentence that
 * says what the programme is, what it costs and when it closes, rather than
 * letting WhatsApp fall back to a bare domain and a favicon.
 */
export const metadata: Metadata = {
  title: "Apply",
  description:
    `Applications are open for BSMS Tajweed: tajweed and Qur'an memorisation for `
    + `Brighton, Sussex and BSMS students. ${feeLabel()} for the year. `
    + `Closes ${CLOSES_LABEL}.`,
  openGraph: {
    title: "Apply to BSMS Tajweed",
    description:
      `Tajweed and Qur'an memorisation for Brighton, Sussex and BSMS students. `
      + `${feeLabel()} for the year. Applications close ${CLOSES_LABEL}.`,
    url: "/apply",
    siteName: "BSMS Tajweed",
    images: [{ url: BRAND_LOGO, width: 1200, height: 630, alt: "BSMS Tajweed" }],
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function Apply() {
  const open = signupsOpen();

  return (
    <div className="shellview">
      {open ? (
        /* The funnel brings its own header: it is full-size on the opening
           screen and collapses to one line from the first question on, which
           a header rendered out here could not do. */
        <ApplyFunnel />
      ) : (
        /* Closed. Said plainly, with the date, and with somewhere to go next —
           a bare "closed" leaves someone who has just been sent the link with
           no idea whether they missed it by an hour or a year. */
        <>
          <header className="masthead pb-8">
            <Link href="/" aria-label="BSMS Tajweed home">
              <Image
                src={BRAND_LOGO} alt="BSMS Tajweed" width={80} height={80}
                className="mb-8 rounded-2xl" priority
              />
            </Link>
            <h1>
              <span>Applications are closed for</span>
              <br />
              <b>BSMS Tajweed.</b>
            </h1>
          </header>
          <div className="mx-auto max-w-2xl">
            <div className="rounded-xl border border-line p-6">
              <p className="text-sm text-muted-foreground">
                Sign-ups for this year closed on{" "}
                <b className="text-foreground">{CLOSES_LABEL}</b>, and we are no
                longer taking applications.
              </p>
              <p className="mt-4 text-sm text-muted-foreground">
                We open again next year, in shā&apos; Allāh. Follow us on Instagram
                or ask in the ISOC group chat and you&apos;ll hear when the form
                goes back up.
              </p>
            </div>
          </div>
        </>
      )}

      <footer className="mt-16 border-t border-line pt-6">
        <p className="text-xs text-muted-foreground">
          Already on the course?{" "}
          <Link href="/login" className="underline underline-offset-2">Sign in</Link>.
        </p>
      </footer>
    </div>
  );
}
