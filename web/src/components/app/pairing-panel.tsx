"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { assignPair, unassignPair } from "@/lib/hifz/review-actions";

export type PairRow = { id: string; label: string };
export type UnpairedStudent = { id: string; name: string };

/** Teacher-side revision pairs: current pairs with unpair, plus two selects
 *  over the unpaired students to form a new one. */
export function PairingPanel({ pairs, unpaired }: { pairs: PairRow[]; unpaired: UnpairedStudent[] }) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [pending, startTransition] = useTransition();
  const selectCls = "h-8 rounded-md border border-line bg-transparent px-2 text-sm";

  return (
    <section className="glass rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-medium">Revision pairs</h2>
      {pairs.length > 0 && (
        <ul className="space-y-1.5">
          {pairs.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{p.label}</span>
              <Button size="sm" variant="outline" disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await unassignPair(p.id);
                    router.refresh();
                  })
                }>
                Unpair
              </Button>
            </li>
          ))}
        </ul>
      )}
      {unpaired.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="First student" value={a} onChange={(e) => setA(e.target.value)} className={selectCls}>
            <option value="">First student…</option>
            {unpaired.filter((s) => s.id !== b).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select aria-label="Second student" value={b} onChange={(e) => setB(e.target.value)} className={selectCls}>
            <option value="">Second student…</option>
            {unpaired.filter((s) => s.id !== a).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <Button size="sm" disabled={!a || !b || pending}
            onClick={() =>
              startTransition(async () => {
                await assignPair(a, b);
                setA("");
                setB("");
                router.refresh();
              })
            }>
            {pending ? "Pairing…" : "Pair"}
          </Button>
        </div>
      )}
      {unpaired.length === 1 && (
        <p className="text-xs text-muted-foreground">{unpaired[0].name} is unpaired.</p>
      )}
      {pairs.length === 0 && unpaired.length === 0 && (
        <p className="text-xs text-muted-foreground">No active students.</p>
      )}
    </section>
  );
}
