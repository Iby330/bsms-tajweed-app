import type { Metadata } from "next";
import { ApplicationsBoard } from "@/components/app/applications-board";
import { applications, placeableClasses } from "@/lib/applications/queries";
import { PAYMENT_LINK, feeLabel } from "@/lib/applications/form";

export const metadata: Metadata = { title: "Applications" };
// Applications arrive from the public form at any moment, and this screen is
// opened precisely to see whether any have. A cached render would show a
// teacher an empty list while somebody was filling one in.
export const dynamic = "force-dynamic";

/**
 * Who has applied, and where each of them is up to.
 *
 * The teacher's half of /apply. Nothing here creates an account: placing
 * somebody in a class records the decision, and the existing invitation flow
 * still makes the login.
 */
export default async function Applications() {
  const [rows, classes] = await Promise.all([applications(), placeableClasses()]);

  return (
    <>
      <header className="masthead">
        <h1>
          <span>Applications</span>
          <br />
          <b>for the coming year.</b>
        </h1>
        <p>
          Everyone who has applied through{" "}
          <a href="/apply" className="underline underline-offset-2">
            bsmstajweed.com/apply
          </a>
          . Invite them to the online recitation session, record what you hear,
          then place them in a group — they get their login once they&apos;re
          placed.
        </p>
        {!PAYMENT_LINK && (
          /* Stated on the screen rather than left to whoever remembers: with
             no link set, /apply tells applicants the payment details follow by
             email, and nobody ticks that they have paid. Every row will
             therefore read "not confirmed" until somebody sends those details
             — which looks like a bug unless you know. */
          <p className="mt-3 max-w-[60ch] text-sm text-danger">
            No payment link is set, so the form asks nobody to confirm paying
            the {feeLabel()}{" "}fee — it tells them the details follow by email.
            Every application will show as unpaid until you send them.
          </p>
        )}
      </header>

      <div className="divider" aria-hidden>
        <span className="r" /><span className="m" /><span className="r" />
      </div>

      <ApplicationsBoard rows={rows} classes={classes} />
    </>
  );
}
