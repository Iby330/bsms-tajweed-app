"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { clearSeatCookie, supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          clearSeatCookie();
          await supabaseBrowser().auth.signOut();
          router.push("/login");
          router.refresh();
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
