"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startSession } from "@/lib/hifz/review-actions";

export function StartReviewButton({
  reciterId, partnerName, disabled,
}: { reciterId: string; partnerName: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          await startSession(reciterId);
          router.refresh();
        })
      }
    >
      {pending ? "Starting…" : `Start reviewing ${partnerName}`}
    </Button>
  );
}
