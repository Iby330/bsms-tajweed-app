import { supabaseServer } from "@/lib/supabase/server";

export type SeasonFinance = {
  season_id: number;
  label: string;
  opening_balance: number;
  deposits: number;
  gross_income: number;
  costs: number;
  left_over: number;
};

export type DepositRow = {
  id: string;
  student_id: string | null;
  full_name: string;
  section: "brothers" | "sisters";
  still_in: boolean;
  strikes: [number, number, number];
  notes: string | null;
  total: number;
  first_amount: number | null;
  re_entries: number;
};

export type ExpenseRow = {
  id: string;
  description: string;
  category: string;
  amount: number;
  paid_by: string | null;
  paid_by_name: string | null;
  payer: string;
  reimbursed: boolean;
  incurred_on: string;
};

export type Season = {
  id: number;
  label: string;
  deposit_amount: number;
  opening_balance: number;
};

/** The season the tracker is showing — the one flagged current, else the newest. */
export async function currentSeason(): Promise<Season | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from("seasons")
    .select("id, label, deposit_amount, opening_balance")
    .order("is_current", { ascending: false })
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Season | null;
}

export async function seasonFinance(seasonId: number): Promise<SeasonFinance | null> {
  const db = await supabaseServer();
  const { data } = await db
    .from("v_season_finance")
    .select("*")
    .eq("season_id", seasonId)
    .maybeSingle();
  return data as SeasonFinance | null;
}

/**
 * The roster, with each person's total paid.
 *
 * Two reads rather than an embed: the totals live in a view, and PostgREST
 * cannot embed a view that has no foreign key back to the table. Joining them
 * in memory over a few dozen rows is cheaper than the round trip it would
 * take to work around that.
 */
export async function depositRoster(seasonId: number): Promise<DepositRow[]> {
  const db = await supabaseServer();

  const [{ data: entries }, { data: totals }] = await Promise.all([
    db
      .from("deposit_entries")
      .select("id, student_id, full_name, section, still_in, notes, term1_strikes, term2_strikes, term3_strikes")
      .eq("season_id", seasonId)
      .order("section")
      // Anyone marked N sinks to the bottom of their section. They stay on the
      // roster — that is the whole point of it — but the people still on the
      // course are the ones being worked with week to week, so they hold the
      // top of the list. `still_in` descending puts true first.
      .order("still_in", { ascending: false })
      .order("full_name"),
    db.from("v_deposit_entry_totals").select("entry_id, total, first_amount, re_entries"),
  ]);

  const byEntry = new Map(
    (totals ?? []).map((t) => [t.entry_id as string, t]),
  );

  return (entries ?? []).map((e) => {
    const t = byEntry.get(e.id);
    return {
      id: e.id,
      student_id: e.student_id,
      full_name: e.full_name,
      section: e.section,
      still_in: e.still_in,
      strikes: [e.term1_strikes, e.term2_strikes, e.term3_strikes] as [number, number, number],
      notes: e.notes,
      total: Number(t?.total ?? 0),
      first_amount: t?.first_amount == null ? null : Number(t.first_amount),
      re_entries: Number(t?.re_entries ?? 0),
    };
  });
}

export async function seasonExpenses(seasonId: number): Promise<ExpenseRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("expenses")
    .select("id, description, category, amount, paid_by, paid_by_name, reimbursed, incurred_on, profiles(full_name)")
    .eq("season_id", seasonId)
    .order("incurred_on", { ascending: false })
    .order("description");

  return (data ?? []).map((e) => {
    const linked = e.profiles as { full_name: string } | null;
    return {
      id: e.id,
      description: e.description,
      category: e.category,
      amount: Number(e.amount),
      paid_by: e.paid_by,
      paid_by_name: e.paid_by_name,
      // Whoever fronted it: the linked teacher if there is one, else the
      // free-text name for someone with no account.
      payer: linked?.full_name ?? e.paid_by_name ?? "—",
      reimbursed: e.reimbursed,
      incurred_on: e.incurred_on,
    };
  });
}

/** Teachers, for the "paid by" picker. Typing names by hand produced
 *  "Daniyal" and "Daniyal Rahman" as two different payers. */
export async function teacherOptions(): Promise<{ id: string; full_name: string }[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("role", "teacher")
    .order("full_name");
  return data ?? [];
}

export type AuditRow = {
  id: number;
  table_name: string;
  action: string;
  at: string;
  actor: string;
  summary: string;
};

/** The last changes to the money, newest first. */
export async function financeAudit(limit = 30): Promise<AuditRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("finance_audit")
    .select("id, table_name, action, at, actor_id, before, after")
    .order("at", { ascending: false })
    .limit(limit);
  if (!data?.length) return [];

  const actorIds = [...new Set(data.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await db.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const obj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : null;

  /**
   * What the row was about, in a few words.
   *
   * Costs and roster entries name themselves. A season has neither a
   * description nor a person's name, so it used to come out as a bare dash —
   * which is the least useful thing the log could say about a change to the
   * deposit price, the one figure every total is computed from. So for those
   * it reports which figure moved.
   */
  const summarise = (row: (typeof data)[number]): string => {
    const after = obj(row.after);
    const before = obj(row.before);
    const named = (o: Record<string, unknown> | null) =>
      (o?.description as string) || (o?.full_name as string) || "";

    if (row.table_name === "seasons") {
      const changed: string[] = [];
      if (before && after) {
        if (before.deposit_amount !== after.deposit_amount) changed.push("the deposit price");
        if (before.opening_balance !== after.opening_balance) changed.push("the carry-over");
      }
      if (changed.length) return changed.join(" and ");
      return `the ${(after?.label as string) || (before?.label as string) || "season"} figures`;
    }

    return named(after) || named(before) || "a row";
  };

  return data.map((r) => ({
    id: r.id,
    table_name: r.table_name,
    action: r.action,
    at: r.at,
    // Null actor means it was written by a script with the service key rather
    // than by a signed-in teacher — the seed, most often.
    actor: r.actor_id ? (names.get(r.actor_id) ?? "someone") : "a script",
    summary: summarise(r),
  }));
}
