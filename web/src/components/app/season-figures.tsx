"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { addEntry, setSeasonFigures } from "@/lib/deposits/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The two numbers that aren't derived from anything: what carried over from
 *  last year, and what a deposit costs this year. */
export function SeasonFigures({
  seasonId, openingBalance, depositAmount,
}: { seasonId: number; openingBalance: number; depositAmount: number }) {
  const [opening, setOpening] = useState(openingBalance.toFixed(2));
  const [price, setPrice] = useState(depositAmount.toFixed(2));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  /**
   * Changing the deposit price alters nothing already recorded — past payments
   * keep the amount they were taken at, which is the point. That leaves a
   * field you can edit with no visible consequence anywhere, so it says so
   * itself rather than leaving you to wonder whether it saved.
   */
  const save = () =>
    startTransition(async () => {
      const result = await setSeasonFigures(seasonId, Number(opening), Number(price));
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });

  return (
    <span className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Carried over</span>
        <Input
          value={opening} onChange={(e) => setOpening(e.target.value)} onBlur={save}
          type="number" step="0.01" disabled={pending}
          className="h-7 w-24 text-right tabular-nums"
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Deposit</span>
        <Input
          value={price} onChange={(e) => setPrice(e.target.value)} onBlur={save}
          type="number" step="0.01" min="0" disabled={pending}
          className="h-7 w-20 text-right tabular-nums"
        />
      </label>
      <span
        aria-live="polite"
        className={cn(
          "text-xs text-ok transition-opacity",
          saved ? "opacity-100" : "opacity-0",
        )}
      >
        Saved — applies to new payments
      </span>
    </span>
  );
}

/** Someone with no app account — most of the roster, in a real year. */
export function AddPersonForm({ seasonId }: { seasonId: number }) {
  const [name, setName] = useState("");
  const [section, setSection] = useState<"brothers" | "sisters">("brothers");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addEntry(seasonId, name, section);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-line pt-5">
      <Input
        value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Name" aria-label="Name" className="h-8 min-w-[12rem] flex-1"
      />
      <select
        value={section} onChange={(e) => setSection(e.target.value as "brothers" | "sisters")}
        aria-label="Section"
        className="h-8 rounded-lg border border-line bg-background text-foreground px-2 text-sm capitalize"
      >
        <option value="brothers">brothers</option>
        <option value="sisters">sisters</option>
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Add person</Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
