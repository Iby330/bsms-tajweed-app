import type { Metadata } from "next";
import { ApplicationsBoard } from "@/components/app/applications-board";
import { applications, placeableClasses } from "@/lib/applications/queries";
import { PAYMENT_LINK, WHATSAPP_GROUPS, feeLabel } from "@/lib/applications/form";

export const metadata: Metadata = { title: "Applications" };
// Applications arrive from the public form at any moment, and this screen is
// opened precisely to see whether any have. A cached render would show a
// teacher an empty list while somebody was filling one in.
export const dynamic = "force-dynamic";

/**
 * Who has applied, and where each of them is up to.
 *
 * The teacher's half of /apply. Placing somebody in a class records the
 * decision only; Send login is the separate, deliberate step that makes their
 * account, so a slip of a dropdown never emails anyone.
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
          then place them in a class. Tick the people you&apos;ve placed and press
          Send login: that makes their account and emails them a link to set their
          password.
        </p>
        {(!WHATSAPP_GROUPS.brothers || !WHATSAPP_GROUPS.sisters) && (
          <p className="mt-3 max-w-[60ch] text-sm text-danger">
            {!WHATSAPP_GROUPS.brothers && !WHATSAPP_GROUPS.sisters
              ? "No WhatsApp group links are set"
              : `No WhatsApp group link is set for the ${WHATSAPP_GROUPS.brothers ? "sisters" : "brothers"}`}
            , so the confirmation email says you&apos;ll message them instead of
            giving them a group to join.
          </p>
        )}
        {!PAYMENT_LINK && (
          /* Stated on the screen rather than left to whoever remembers: with
             no link set, /apply tells applicants the payment details follow by
             email, and nobody ticks that they have paid. Every row will
             therefore read "not confirmed" until somebody sends those details
             — which looks like a bug unless you know. */
          <p className="mt-3 max-w-[60ch] text-sm text-danger">
            No payment link is set, so the form asks nobody to confirm paying
            the {feeLabel()}{" "}fee. It tells them the details follow by email.
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
