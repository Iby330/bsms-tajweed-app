import { supabaseServer } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type Status = Database["public"]["Enums"]["application_status_t"];
export type Section = Database["public"]["Enums"]["section_t"];

export type ApplicationRow = {
  id: string;
  created_at: string;
  first_name: string;
  surname: string;
  email: string;
  phone: string;
  section: Section;
  university: string;
  year_of_study: string;
  enrolled_before: boolean;
  memorised: string;
  arabic_reading: string;
  tajweed_level: string;
  heard_from: string;
  motivation: string;
  fee_pence: number;
  paid_confirmed: boolean;
  fee_settled: boolean;
  status: Status;
  assessed_level: string | null;
  class_id: string | null;
  notes: string | null;
  reviewed_at: string | null;
  confirmation_sent_at: string | null;
  profile_id: string | null;
  login_sent_at: string | null;
  read_surah: number | null;
  read_ayah_from: number | null;
  read_ayah_to: number | null;
};

export type ClassOption = { id: string; name: string; section: Section };

/**
 * Every application, newest first.
 *
 * Not paginated, and that is a considered choice rather than an omission: an
 * intake is tens of people, not thousands, and the screen's whole job is to
 * work through the list — counting who is still to be heard, filtering by
 * side. Paging would hide exactly the totals the page exists to show. If an
 * intake ever runs to hundreds this needs revisiting.
 *
 * RLS does the access control (teachers only). The teacher layout has already
 * bounced anyone else long before this runs.
 */
export async function applications(): Promise<ApplicationRow[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("applications")
    // ONE template literal, never a concatenation: a select built with `+`
    // widens to `string`, and postgrest-js then infers nothing at all — the
    // rows come back typed as an error object that only bites at the property
    // access, far from the cause. (LEARNINGS.md, 2026-08-12.)
    .select(`id, created_at, first_name, surname, email, phone, section, university,
      year_of_study, enrolled_before, memorised, arabic_reading, tajweed_level,
      heard_from, motivation, fee_pence, paid_confirmed, fee_settled, status,
      assessed_level, class_id, notes, reviewed_at, confirmation_sent_at, profile_id,
      login_sent_at, read_surah, read_ayah_from, read_ayah_to`)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * The classes an applicant can be placed into.
 *
 * `demo` is excluded — it is the training cohort from migration 0020, and
 * placing a real applicant in it would put them in a class of test students.
 */
export async function placeableClasses(): Promise<ClassOption[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from("classes")
    .select("id, name, section")
    .neq("section", "demo")
    .order("name");
  return data ?? [];
}
