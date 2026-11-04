"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startSession } from "@/lib/hifz/review-actions";

export function StartReviewButton({
  reciterId, partnerName, disabled, label,
}: { reciterId: string; partnerName: string; disabled?: boolean; label?: string }) {
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
      {pending ? "Starting…" : label ?? `Start reviewing ${partnerName}`}
    </Button>
  );
}
