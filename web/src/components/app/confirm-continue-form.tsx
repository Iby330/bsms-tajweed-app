"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The press that spends an emailed token (see app/auth/confirm/verify).
 *
 * A plain form post, not a server action: the verify route writes the session
 * cookies onto its own redirect, the one version that cannot drop them. The
 * only script here stops a double tap, since a second post of the same token
 * would land on "already used" after the first had worked.
 */
export function ConfirmContinueForm({
  tokenHash,
  type,
  next,
}: {
  tokenHash: string;
  type: string;
  next: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      method="post"
      action="/auth/confirm/verify"
      onSubmit={(e) => {
        if (busy) e.preventDefault();
        else setBusy(true);
      }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" className="w-full" aria-disabled={busy}>
        {busy ? "One moment…" : "Continue"}
      </Button>
    </form>
  );
}
