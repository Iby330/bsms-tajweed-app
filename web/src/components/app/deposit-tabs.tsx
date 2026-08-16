"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["money", "roster", "costs", "history"] as const;
type Tab = (typeof TABS)[number];

/**
 * Roster and money, one at a time, with the open tab in the URL.
 *
 * Keeping it in `?tab=` rather than component state means a teacher can send
 * "look at the costs" as a link, the back button steps through tabs the way
 * people expect it to, and a reload doesn't drop you back on Money.
 *
 * `router.replace` with `scroll: false` — pushing would fill the history stack
 * with one entry per tab click, and scrolling to the top on a tab change is
 * disorienting when you are part-way down the roster.
 */
export function DepositTabs({
  money, roster, costs, history, rosterCount, costCount,
}: {
  money: React.ReactNode;
  roster: React.ReactNode;
  costs: React.ReactNode;
  history: React.ReactNode;
  rosterCount: number;
  costCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get("tab");
  const current: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "money";

  const onChange = useCallback(
    (value: unknown) => {
      const next = new URLSearchParams(params.toString());
      // Money is the default, so it stays out of the URL rather than making
      // every shared link carry ?tab=money.
      if (value === "money") next.delete("tab");
      else next.set("tab", String(value));
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <Tabs value={current} onValueChange={onChange} className="w-full">
      <TabsList variant="line" className="mb-4">
        <TabsTrigger value="money">Money</TabsTrigger>
        <TabsTrigger value="roster">
          Roster
          <span className="ml-1.5 text-xs text-muted-foreground">{rosterCount}</span>
        </TabsTrigger>
        <TabsTrigger value="costs">
          Costs
          <span className="ml-1.5 text-xs text-muted-foreground">{costCount}</span>
        </TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      {/* keepMounted: Base UI drops an inactive panel from the DOM entirely,
          so every tab switch would re-mount the tables and lose whatever was
          half-typed in an input. */}
      <TabsContent value="money" keepMounted>{money}</TabsContent>
      <TabsContent value="roster" keepMounted>{roster}</TabsContent>
      <TabsContent value="costs" keepMounted>{costs}</TabsContent>
      <TabsContent value="history" keepMounted>{history}</TabsContent>
    </Tabs>
  );
}
