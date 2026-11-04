# Esteemed Ustadhs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the walled-off Esteemed Ustadhs class, with five teachers acting as students on one login through a switch, and with Resources and Hifdh revision pairs working on day one.

**Architecture:** Each teacher gets a seat: a second `profiles` row with no auth user, linked by `profiles.login_id`. A database function, `acting_id()`, replaces `auth.uid()` in public policies, views and functions, and honours an `x-bsms-seat` header only when the seat belongs to the caller. A session cookie selects the seat.

**Tech Stack:** Next.js (read `web/node_modules/next/dist/docs/` before touching cookies or server actions), Supabase/PostgREST, vitest. There is no local database: localhost reads and writes production.

**Spec:** `docs/superpowers/specs/2026-11-04-esteemed-ustadhs-design.md`

**Paths:** all commands run from the worktree root, `.claude/worktrees/esteemed-ustadhs`. Migrations apply with `npx --prefix web tsx execution/apply_migration.ts <file>`.

**Numbers:** migration numbers below assume `0129` is newest. Fetch `origin/main` and renumber before applying.

---

## Release A: no visible change

### Task 0: Worktree setup

- [ ] `ln -s "../../../../web/.env.local" web/.env.local` (gitignored; check the link resolves).
- [ ] `npm ci --prefix web`
- [ ] Baseline: `npm test --prefix web`. Record any failures so they aren't blamed on this work.

### Task 1: Sections

**Files:**
- Create: `web/supabase/migrations/0130_ustadhs_section.sql`, `web/src/lib/sections.ts`, `web/src/lib/sections.test.ts`
- Modify: `web/src/lib/database.types.ts`, `web/src/lib/attendance/calendar.ts`, `web/src/lib/teacher/scope.ts`, `web/src/lib/teacher/scope.test.ts`, `web/src/app/teacher/roster/page.tsx`, `web/src/lib/applications/queries.ts`, `web/src/lib/deposits/queries.ts`, `web/src/app/teacher/classes/page.tsx`, `web/src/app/teacher/home/page.tsx`, `web/src/app/(student)/home/page.tsx`, `web/src/app/teacher/calendar/page.tsx`

- [ ] **Step 1: Write the enum migration**

```sql
-- A fourth section: the teachers' own class, walled off from the programme.
-- ADD VALUE can't share a batch with anything that uses the value (see 0020).
alter type section_t add value if not exists 'ustadhs';
```

- [ ] **Step 2: Add `ustadhs` to `section_t` in `database.types.ts`**, in both the union and the `Constants` array. Add `login_id: string | null` to the `profiles` Row, and `login_id?: string | null` to Insert and Update.

- [ ] **Step 3: Write the failing test** in `web/src/lib/sections.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { cohortLabels, isProgrammeSection, sectionsVisibleTo } from "./sections";

describe("isProgrammeSection", () => {
  it("is only the two real cohorts", () => {
    expect(isProgrammeSection("brothers")).toBe(true);
    expect(isProgrammeSection("sisters")).toBe(true);
    expect(isProgrammeSection("demo")).toBe(false);
    expect(isProgrammeSection("ustadhs")).toBe(false);
    expect(isProgrammeSection(null)).toBe(false);
  });
});

describe("sectionsVisibleTo", () => {
  it("keeps the ustadhs out of everyone else's lists", () => {
    expect(sectionsVisibleTo("brothers")).toEqual(["brothers", "sisters"]);
    expect(sectionsVisibleTo("sisters")).toEqual(["brothers", "sisters"]);
  });
  it("adds the ustadhs for someone in that section", () => {
    expect(sectionsVisibleTo("ustadhs")).toEqual(["ustadhs", "brothers", "sisters"]);
  });
});

describe("cohortLabels", () => {
  it("names each cohort and offers the programme board only to real ones", () => {
    expect(cohortLabels("sisters")).toEqual({ noun: "sisters", classes: "Sisters' classes", crossSection: true });
    expect(cohortLabels("brothers")).toEqual({ noun: "brothers", classes: "Brothers' classes", crossSection: true });
    expect(cohortLabels("demo")).toEqual({ noun: "demo classes", classes: "Demo classes", crossSection: false });
    expect(cohortLabels("ustadhs")).toEqual({ noun: "ustadhs", classes: "Esteemed Ustadhs", crossSection: false });
  });
});
```

- [ ] **Step 4: Run it and confirm it fails:** `npm test --prefix web -- src/lib/sections.test.ts` (module not found).

- [ ] **Step 5: Implement** `web/src/lib/sections.ts`

```ts
import type { Section } from "@/lib/attendance/calendar";

/** The two real cohorts. `demo` is a training cohort and `ustadhs` is the
 *  teachers' own class; neither belongs on a programme list or board. */
export const PROGRAMME_SECTIONS = ["brothers", "sisters"] as const;
export type ProgrammeSection = (typeof PROGRAMME_SECTIONS)[number];

export function isProgrammeSection(s: string | null | undefined): s is ProgrammeSection {
  return s === "brothers" || s === "sisters";
}

/** The sections a teacher's class lists may show. The ustadhs appear only to
 *  someone in that section, which today means their teacher. */
export function sectionsVisibleTo(viewer: string | null | undefined): Section[] {
  return viewer === "ustadhs" ? ["ustadhs", ...PROGRAMME_SECTIONS] : [...PROGRAMME_SECTIONS];
}

/** How a home page names the viewer's cohort, and whether the programme-wide
 *  board differs from it. A walled-off cohort's "everyone" is itself. */
export function cohortLabels(section: Section | null | undefined) {
  switch (section) {
    case "sisters": return { noun: "sisters", classes: "Sisters' classes", crossSection: true };
    case "demo": return { noun: "demo classes", classes: "Demo classes", crossSection: false };
    case "ustadhs": return { noun: "ustadhs", classes: "Esteemed Ustadhs", crossSection: false };
    default: return { noun: "brothers", classes: "Brothers' classes", crossSection: true };
  }
}
```

- [ ] **Step 6: Run the test and confirm it passes.**

- [ ] **Step 7: Apply the section rules**

`calendar.ts`, in `SECTION_TIMETABLES`:
```ts
  // Placeholder until the ustadhs' real days are known.
  ustadhs: { tajweed: MONDAY, hifdh: THURSDAY },
```

`scope.ts`:
```ts
// in teacherClasses(), replacing the is_admin line
q = profile.is_admin ? q.in("section", sectionsVisibleTo(profile.section)) : q.eq("section", profile.section);

// the body of canOpenSection()
if (viewerIsAdmin && isProgrammeSection(classSection)) return true;
return !!viewerSection && !!classSection && viewerSection === classSection;

// in SECTION_POSSESSIVE
ustadhs: "the ustadhs’",
```
Add to `scope.test.ts`:
```ts
describe("canOpenSection and the ustadhs", () => {
  it("is closed to a programme admin and open to its own section", () => {
    expect(canOpenSection("brothers", "ustadhs", true)).toBe(false);
    expect(canOpenSection("brothers", "ustadhs", false)).toBe(false);
    expect(canOpenSection("ustadhs", "ustadhs", true)).toBe(true);
    expect(canOpenSection("ustadhs", "sisters", true)).toBe(true);
  });
});
```

`teacher/roster/page.tsx`, in the `classRows` query:
```ts
db.from("classes").select("id, name, section, teacher_id").in("section", sectionsVisibleTo(mine?.section)).order("name"),
```

`applications/queries.ts`, in `placeableClasses()`:
```ts
.in("section", [...PROGRAMME_SECTIONS])
```

`deposits/queries.ts`, the filter (the `.in()` above it already excludes other sections):
```ts
.filter((e): e is typeof e & { section: ProgrammeSection } => isProgrammeSection(e.section))
```

`teacher/classes/page.tsx`, the `sections` constant:
```ts
const sections = profile?.section === "demo" ? (["demo"] as const) : sectionsVisibleTo(profile?.section);
```
Add a branch to the intro line: `profile?.section === "ustadhs"` shows "Your class, and every class across the programme."

`teacher/home/page.tsx` and `(student)/home/page.tsx`: replace `cohortNoun`, `cohortClassesLabel` and `crossSection` with:
```ts
const { noun: cohortNoun, classes: cohortClassesLabel, crossSection } = cohortLabels(profile.section);
```
Student home also has `cohortLabel = \`All ${cohortNoun}\``, which stays.

`teacher/calendar/page.tsx`, the heading label:
```tsx
{section === "sisters" ? "Sisters" : section === "ustadhs" ? "Esteemed Ustadhs" : "Brothers"}
```

- [ ] **Step 8: Find every remaining site:** `npx --prefix web tsc --noEmit -p web`. Each `Record<Section, …>` the new value breaks gets an `ustadhs` entry. Then `grep -rnE "section.*\"demo\"|\"demo\".*section" web/src execution/send_invites.ts`, and move any "real programme" check to `PROGRAMME_SECTIONS`. In `send_invites.ts`, use `.in("section", ["brothers", "sisters"])` for the admin count.

- [ ] **Step 9: Run tests, then commit** only the files above.

### Task 2: Seats and `acting_id()`

**Files:** Create `web/supabase/migrations/0131_seats_and_acting_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- One login, two roles. A seat is a profile row with no auth user of its own,
-- owned through login_id. acting_id() says which row a request acts as. With
-- no x-bsms-seat header it IS auth.uid(), so nothing changes for anyone else.
-- Kill switch: redefine acting_id() as `select auth.uid()`.

alter table profiles add column if not exists login_id uuid unique references auth.users(id) on delete cascade;
comment on column profiles.login_id is
  'Set on a seat only: the login that may act as this row. Null on normal profiles.';

-- A seat's id has no auth.users row. Normal profiles keep their old cascade
-- through the trigger below.
alter table profiles drop constraint if exists profiles_id_fkey;

create or replace function public.delete_profile_with_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;
drop trigger if exists delete_profile_with_login on auth.users;
create trigger delete_profile_with_login after delete on auth.users
  for each row execute function public.delete_profile_with_login();

-- login_id is what acting_id() trusts, so no app role may ever write it.
create or replace function public.guard_login_id() returns trigger
language plpgsql as $$
begin
  if new.login_id is distinct from old.login_id and current_user in ('authenticated', 'anon') then
    raise exception 'login_id cannot be changed from the app';
  end if;
  return new;
end $$;
drop trigger if exists guard_login_id on profiles;
create trigger guard_login_id before update on profiles
  for each row execute function public.guard_login_id();

create or replace function public.guard_login_id_insert() returns trigger
language plpgsql as $$
begin
  if new.login_id is not null and current_user in ('authenticated', 'anon') then
    raise exception 'login_id cannot be set from the app';
  end if;
  return new;
end $$;
drop trigger if exists guard_login_id_insert on profiles;
create trigger guard_login_id_insert before insert on profiles
  for each row execute function public.guard_login_id_insert();

-- A seat shows the same name and picture as its owner.
create or replace function public.sync_seat_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set full_name = new.full_name, avatar_url = new.avatar_url
   where login_id = new.id;
  return null;
end $$;
drop trigger if exists sync_seat_identity on profiles;
create trigger sync_seat_identity after update of full_name, avatar_url on profiles
  for each row execute function public.sync_seat_identity();

create or replace function public.acting_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  headers text := current_setting('request.headers', true);
  seat uuid;
begin
  -- The common path: no seat named, so no JSON parse and no table read.
  if headers is null or position('x-bsms-seat' in headers) = 0 then
    return auth.uid();
  end if;
  select p.id into seat from public.profiles p
   where p.id::text = headers::json->>'x-bsms-seat' and p.login_id = auth.uid();
  return coalesce(seat, auth.uid());
end $$;
revoke all on function public.acting_id() from public;
grant execute on function public.acting_id() to authenticated, anon, service_role;

-- The programme-wide boards treated "not demo" as "the programme". A walled-off
-- viewer sees only their own cohort; everyone else sees the two real ones.
create or replace view v_lb_individual_all as
 SELECT p.full_name, c.name AS class_name, p.section,
    round(avg(hp.pct), 2) AS pct,
    rank() OVER (ORDER BY (avg(hp.pct)) DESC) AS rank
   FROM v_hw_pct_all hp
     JOIN profiles p ON p.id = hp.student_id AND p.is_active AND NOT p.hidden_from_students
     JOIN classes c ON c.id = p.class_id
  WHERE CASE
          WHEN ((SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid()) IN ('demo'::section_t, 'ustadhs'::section_t))
            THEN p.section = (SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid())
          ELSE p.section IN ('brothers'::section_t, 'sisters'::section_t)
        END
  GROUP BY p.id, p.full_name, c.name, p.section;

create or replace view v_lb_hifz_class_all as
 SELECT c.name AS class_name, c.section,
    round(avg(h.pct), 2) AS pct,
    rank() OVER (ORDER BY (avg(h.pct)) DESC) AS rank
   FROM v_hifz_progress_all h
     JOIN profiles p ON p.id = h.student_id AND p.is_active AND NOT p.hidden_from_students
     JOIN classes c ON c.id = p.class_id
  WHERE CASE
          WHEN ((SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid()) IN ('demo'::section_t, 'ustadhs'::section_t))
            THEN c.section = (SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid())
          ELSE c.section IN ('brothers'::section_t, 'sisters'::section_t)
        END
  GROUP BY c.id, c.name, c.section;
```

The `auth.uid()` in these views is rewritten by Task 3. `0132` must run after this file.

- [ ] **Step 2:** Take the before snapshot (Task 3, Step 3), then apply `0130` and `0131`.

### Task 3: The rewrite, and proof it changed nothing

**Files:**
- Create: `web/supabase/migrations/0132_acting_id_rewrite.sql`, `execution/verify_acting_id.ts`, `web/src/lib/supabase/acting-id-migrations.test.ts`

- [ ] **Step 1: Write the rewrite**

It reads the live catalog as it applies, so another session's recent migration can't be overwritten by stale generated text. `storage.objects` is left alone: avatars belong to the login, and seats record no voice notes yet.

```sql
do $$
declare
  r record;
  remaining int;
begin
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%'
  loop
    execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
      case when r.qual is null then '' else 'using (' || replace(r.qual, 'auth.uid()', 'public.acting_id()') || ')' end,
      case when r.with_check is null then '' else 'with check (' || replace(r.with_check, 'auth.uid()', 'public.acting_id()') || ')' end);
  end loop;

  for r in
    select c.relname, c.reloptions, rtrim(pg_get_viewdef(c.oid), ';') as def
      from pg_class c
     where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
       and pg_get_viewdef(c.oid) like '%auth.uid()%'
  loop
    -- OR REPLACE resets reloptions unless they are restated.
    execute format('create or replace view public.%I %s as %s', r.relname,
      case when r.reloptions is null then '' else 'with (' || array_to_string(r.reloptions, ',') || ')' end,
      replace(r.def, 'auth.uid()', 'public.acting_id()'));
  end loop;

  for r in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc like '%auth.uid()%'
       and p.proname not in ('acting_id', 'log_finance_change', 'record_fee_deposit')
  loop
    execute replace(pg_get_functiondef(r.oid), 'auth.uid()', 'public.acting_id()');
  end loop;

  select count(*) into remaining from pg_policies
   where schemaname = 'public' and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%';
  if remaining > 0 then raise exception 'rewrite left % policies on auth.uid()', remaining; end if;
end $$;
```

- [ ] **Step 2: Write `execution/verify_acting_id.ts`**

It runs a row count over every RLS-protected public table and every `v_*` view, for each persona, with claims set in the batch's implicit transaction. The batch only reads. Usage: `--save <file>` and `--compare <file>`.

```ts
/**
 * verify_acting_id.ts: what each kind of user can see, as row counts.
 *
 *   npx --prefix web tsx execution/verify_acting_id.ts --save before.json
 *   npx --prefix web tsx execution/verify_acting_id.ts --compare before.json
 *
 * Reads only. A multi-statement batch runs as one implicit transaction, so
 * SET LOCAL holds until the final SELECT, whose rows the API returns.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "..");
const env: Record<string, string> = {};
for (const line of readFileSync(join(repo, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const token = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

async function sql(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body}`);
  return JSON.parse(body) as Record<string, unknown>[];
}

/** Picked by what they are, so the script needs no ids or emails in the repo. */
const PERSONAS: Record<string, string> = {
  student: `select id from profiles where role='student' and is_active and section='brothers' and class_id is not null order by created_at limit 1`,
  teacher: `select teacher_id as id from classes where name='Masjid Al-Aqsa'`,
  sisters_teacher: `select teacher_id as id from classes where name='Hareer'`,
  admin: `select id from profiles where is_admin limit 1`,
};

async function main() {
  const objects = await sql(`
    select c.relname from pg_class c
     where c.relnamespace='public'::regnamespace
       and ((c.relkind='r' and c.relrowsecurity) or (c.relkind='v' and c.relname like 'v\\_%'))
     order by 1`);
  const names = objects.map((o) => o.relname as string);
  const out: Record<string, Record<string, number | string>> = {};
  for (const [persona, pick] of Object.entries(PERSONAS)) {
    const [{ id }] = await sql(pick);
    out[persona] = {};
    for (const name of names) {
      const claims = JSON.stringify({ sub: id, role: "authenticated" });
      try {
        const rows = await sql(`
          set local role authenticated;
          select set_config('request.jwt.claims', '${claims}', true);
          select count(*)::int as n from public."${name}";`);
        out[persona][name] = rows[0].n as number;
      } catch (e) {
        out[persona][name] = `error: ${(e as Error).message.slice(0, 100)}`;
      }
    }
  }
  const mode = process.argv[2];
  const file = process.argv[3];
  if (mode === "--save") {
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`saved ${names.length} objects for ${Object.keys(out).length} personas`);
    return;
  }
  const before = JSON.parse(readFileSync(file, "utf8"));
  let diffs = 0;
  for (const p of Object.keys(out)) for (const n of names) {
    if (before[p]?.[n] !== out[p][n]) {
      diffs++;
      console.log(`${p} ${n}: ${before[p]?.[n]} -> ${out[p][n]}`);
    }
  }
  console.log(diffs ? `${diffs} differences` : "identical");
  process.exit(diffs ? 1 : 0);
}
main();
```

- [ ] **Step 3: Save the before snapshot, before applying `0130`–`0132`:** run `--save` to the scratchpad. Check the file: `teacher` must see many `profiles` rows and `student` exactly one. If they match, the claims aren't taking effect, so fix that first.

- [ ] **Step 4: Apply `0130`, `0131`, `0132` in order.** Run `--compare`. Expected: `identical`, apart from rows live users added in between. Investigate each difference. Any `error:` or a large change means applying the kill switch and stopping.

- [ ] **Step 5: Add the guard test** `web/src/lib/supabase/acting-id-migrations.test.ts`

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase/migrations");
const REWRITE = "0132_acting_id_rewrite.sql";

/** Copying an old policy forward with auth.uid() would quietly break it for a
 *  seat. Storage policies and the finance functions keep auth.uid() on purpose. */
describe("migrations after the acting_id rewrite", () => {
  it("use acting_id(), not auth.uid()", () => {
    const later = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f > REWRITE);
    const offenders = later.filter((f) => {
      const sql = readFileSync(join(DIR, f), "utf8").replace(/--.*$/gm, "");
      return sql.includes("auth.uid()") && !/storage\.objects|log_finance_change|record_fee_deposit/.test(sql);
    });
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 6: Commit** the three new files, plus `0130` and `0131`.

### Task 4: Seat identity in the app

**Files:**
- Create: `web/src/lib/supabase/seat.ts`, `web/src/lib/supabase/seat.test.ts`
- Modify: `web/src/lib/supabase/server.ts`, `web/src/lib/supabase/client.ts`, `web/src/components/app/shell.tsx`, `web/src/components/app/sign-out-button.tsx`

Read the Next docs on `cookies()` in server actions first. The switch relies on a server action setting a cookie, then redirecting.

- [ ] **Step 1: Write the failing test** `web/src/lib/supabase/seat.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SEAT_COOKIE, seatFromCookieString, seatHeaders } from "./seat";

const id = "11111111-1111-4111-8111-111111111111";

describe("seatFromCookieString", () => {
  it("finds a valid seat among other cookies", () => {
    expect(seatFromCookieString(`a=1; ${SEAT_COOKIE}=${id}; b=2`)).toBe(id);
  });
  it("ignores absent and malformed values", () => {
    expect(seatFromCookieString("a=1")).toBeNull();
    expect(seatFromCookieString(`${SEAT_COOKIE}=nonsense`)).toBeNull();
  });
});

describe("seatHeaders", () => {
  it("adds the header only for a seat", () => {
    expect(seatHeaders(id)).toEqual({ "x-bsms-seat": id });
    expect(seatHeaders(null)).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Implement `seat.ts`**

```ts
/**
 * Which profile row this browser session is acting as. This selects a view and
 * grants nothing: acting_id() in the database ignores a seat the login doesn't
 * own. A session cookie, so a fresh visit opens on the teacher's own class.
 */
export const SEAT_COOKIE = "bsms_seat";
export const SEAT_HEADER = "x-bsms-seat";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validSeat(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

export function seatFromCookieString(cookie: string): string | null {
  const hit = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SEAT_COOKIE}=`));
  return validSeat(hit?.slice(SEAT_COOKIE.length + 1));
}

export function seatHeaders(seat: string | null): Record<string, string> {
  return seat ? { [SEAT_HEADER]: seat } : {};
}
```

- [ ] **Step 4: Run the test and confirm it passes.**

- [ ] **Step 5: Change `server.ts`**

`supabaseServer` takes an option, and account actions pass `asLogin` to act on the login's own row:

```ts
export async function supabaseServer(opts: { asLogin?: boolean } = {}) {
  const store = await cookies();
  const seat = opts.asLogin ? null : validSeat(store.get(SEAT_COOKIE)?.value);
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: seatHeaders(seat) },
      cookies: { /* unchanged */ },
    },
  );
}
```

In `currentProfile`, add `login_id` to the select and try the seat first. A stale cookie finds no row and falls through to the login's own profile:

```ts
const PROFILE_SELECT = "id, full_name, role, section, class_id, is_active, is_admin, avatar_url, setup_complete, unlock_all, login_id, classes!profiles_class_id_fkey(name)";
// …after userId is known
const seat = validSeat((await cookies()).get(SEAT_COOKIE)?.value);
if (seat) {
  const { data, error } = await supabase.from("profiles").select(PROFILE_SELECT).eq("id", seat).eq("login_id", userId).maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  if (data) return data;
}
// …existing read of the login's own row, using PROFILE_SELECT
```

If `tsc` loses the row type on the constant, inline the literal in both calls (LEARNINGS: widened select strings kill inference).

- [ ] **Step 6: Change `client.ts`**

`createBrowserClient` is a singleton, so the header is read on each request instead of at creation. That lets a switch take effect with no page reload:

```ts
export function supabaseBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          const seat = seatFromCookieString(document.cookie);
          if (seat) headers.set(SEAT_HEADER, seat);
          return fetch(input, { ...init, headers });
        },
      },
    },
  );
}

/** Signing out ends the seat too, or the next sign-in opens as a student. */
export function clearSeatCookie() {
  document.cookie = `${SEAT_COOKIE}=; path=/; max-age=0`;
}
```

- [ ] **Step 7: Call `clearSeatCookie()`** before `signOut()` in `shell.tsx` (`SignOutIcon`) and `sign-out-button.tsx`.

- [ ] **Step 8: Check the gateway allows the header from a browser**

```bash
curl -s -o /dev/null -D - -X OPTIONS "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles" \
  -H "Origin: https://bsms-tajweed.netlify.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: x-bsms-seat,apikey" | grep -i access-control-allow
```
Expected: `x-bsms-seat` allowed, or a wildcard. If not, stop and route browser reads through the server.

- [ ] **Step 9: Run tests and tsc, then commit.**

### Task 5: Places that need the login, not the seat

**Files:** Modify `web/src/lib/strikes/notify.ts`, `web/src/lib/marking/notify.ts`, `web/src/lib/account/avatar-actions.ts`, `web/src/lib/account/setup-actions.ts`. Create `web/src/lib/account/login-of.ts`, `web/src/lib/account/login-of.test.ts`.

- [ ] **Step 1: Write the failing test** `login-of.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { loginIdOf } from "./login-of";

describe("loginIdOf", () => {
  it("is the owner for a seat", () => expect(loginIdOf({ id: "seat", login_id: "owner" })).toBe("owner"));
  it("is the profile itself otherwise", () => {
    expect(loginIdOf({ id: "me", login_id: null })).toBe("me");
    expect(loginIdOf(null, "fallback")).toBe("fallback");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

```ts
/** Whose auth user a profile's email lives on. A seat has none of its own. */
export function loginIdOf(p: { id: string; login_id: string | null } | null, fallback?: string): string {
  return p?.login_id ?? p?.id ?? fallback ?? "";
}
```

- [ ] **Step 3: Use it in both notify files**

Read the profile first, because `getUserById` needs its result. In `strikes/notify.ts`:

```ts
const { data: seatRow } = await db.from("profiles").select("id, login_id").eq("id", studentId).maybeSingle();
const [{ data: user }, { data: student }, { data: teacher }, { count }] = await Promise.all([
  db.auth.admin.getUserById(loginIdOf(seatRow, studentId)),
  // …the other three reads, unchanged
]);
```
`marking/notify.ts` gets the same change around `getUserById(o.studentId)`.

- [ ] **Step 4: Account actions use the login**

In `avatar-actions.ts` and `setup-actions.ts`, change each `await supabaseServer()` to `await supabaseServer({ asLogin: true })`. Their `.eq("id", user.id)` then matches a row the session may write, and the sync trigger copies the picture to the seat. `account/actions.ts` only calls Auth, so it stays.

- [ ] **Step 5: Run tests, then commit.**

### Task 6: Hifdh reviewers can pick any surah in this class

Normally a reviewer can only mark surahs the reciter has passed or is on. Teachers present portions from anywhere, and seeded "passed" records would be false, so the rule changes for this section only.

**Files:** Modify `web/src/lib/hifz/review-queries.ts`. Create `web/src/lib/hifz/reviewable.ts`, `web/src/lib/hifz/reviewable.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { reviewableSurahs } from "./reviewable";

const list = [114, 113, 112, 111].map((number) => ({ number }));

describe("reviewableSurahs", () => {
  it("is passed plus current for the programme", () => {
    const out = reviewableSurahs(list, new Set([114]), "brothers");
    expect(out.map((s) => s.number)).toEqual([114, 113]);
    expect(out[1]).toMatchObject({ passed: false, current: true });
  });
  it("is the whole list for the ustadhs, with the first unpassed still current", () => {
    const out = reviewableSurahs(list, new Set([114]), "ustadhs");
    expect(out.map((s) => s.number)).toEqual([114, 113, 112, 111]);
    expect(out.filter((s) => s.current).map((s) => s.number)).toEqual([113]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails, then implement**

```ts
/** Which surahs a reviewer may mark. The programme works through its list in
 *  order; the ustadhs present portions from anywhere in it. */
export function reviewableSurahs<S extends { number: number }>(
  list: S[], passed: Set<number>, section: string | null | undefined,
): (S & { passed: boolean; current: boolean })[] {
  const current = list.find((s) => !passed.has(s.number))?.number ?? null;
  return list
    .filter((s) => section === "ustadhs" || passed.has(s.number) || s.number === current)
    .map((s) => ({ ...s, passed: passed.has(s.number), current: s.number === current }));
}
```

- [ ] **Step 3: Use it in `partnerRange`**

Add the partner's section to the `Promise.all` with `admin.from("profiles").select("section").eq("id", partnerId).maybeSingle()`. Replace the `current` calculation and the `return` with:

```ts
return reviewableSurahs(list, passed, partner?.section).map((s) => ({
  number: s.number, name_en: s.name_en, name_ar: s.name_ar,
  passed: s.passed, current: s.current,
}));
```

- [ ] **Step 4: Run tests, then commit.**

### Task 7: Ship Release A

- [ ] `npm test --prefix web && npm run build --prefix web`
- [ ] `git fetch --all --prune`. Rebase onto `origin/main`, renumber migrations if needed, and rebuild.
- [ ] Heads-up to the owner in a line or two: what else is in flight, per `CLAUDE.md`.
- [ ] Push to `main`: `git push origin feat/esteemed-ustadhs:main`. Stage only this work's files.
- [ ] Confirm the deploy in a browser (LEARNINGS: not `curl` on an SSR route). As a real teacher: roster, Classes, homework and home all look as they did. Run `--compare` again.
- [ ] Measure home page time before and after. If it's clearly slower, profile `acting_id()` before going on.

---

## Data

### Task 8: Create the class

**Files:** Create `web/supabase/migrations/0133_esteemed_ustadhs_class.sql`

This must not be applied until Release A is confirmed live, because live code is what hides it.

- [ ] **Step 1: Write the migration.** People are found by the class they teach, so no emails go in the repo.

```sql
insert into classes (name, section, teacher_id)
select 'Esteemed Ustadhs', 'ustadhs', p.id from profiles p
 where p.is_admin and p.full_name = 'Mohamed K El-Bayouk'
on conflict (name) do nothing;

update profiles set section = 'ustadhs'
 where is_admin and full_name = 'Mohamed K El-Bayouk';

-- One seat per teacher: same name and picture, student in this class, no login.
insert into profiles (id, login_id, full_name, role, section, class_id, is_active, setup_complete, avatar_url)
select gen_random_uuid(), t.id, t.full_name, 'student', 'ustadhs', u.id, true, true, t.avatar_url
  from classes own
  join profiles t on t.id = own.teacher_id
  cross join (select id from classes where name = 'Esteemed Ustadhs') u
 where own.name in ('Masjid Quba', 'Masjid Al-Haram', 'Masjid Al-Aqsa', 'Masjid An-Nabawi', 'Masjid Al-Umawi')
on conflict (login_id) do nothing;

-- A reviewer can only mark a reciter who has a hifz profile. Start at An-Nas
-- with every surah the app holds, so the whole range is on the list.
insert into hifz_profiles (student_id, start_surah, target_count)
select p.id, 114, (select count(*) from surahs)
  from profiles p
 where p.login_id is not null
on conflict (student_id) do nothing;

select p.full_name, p.role, p.section, c.name as class
  from profiles p join classes c on c.id = p.class_id
 where p.section = 'ustadhs';
```

- [ ] **Step 2:** Check `hifz_profiles` for other required columns, then apply. Expected: five rows printed.
- [ ] **Step 3: Check the wall.** As a real student and a brothers' teacher: no class, no seat, no change on any board. `--compare` shows only the new rows where expected: teachers see 5 more `profiles` rows. As a seat: run the same count with `request.headers` set, and confirm one `profiles` row. With another login's seat id in the header: the row count equals the login's normal view.
- [ ] **Step 4: Commit.**

---

## Release B: the switch

### Task 9: Switch action and UI

**Files:**
- Create: `web/src/lib/account/switch-view.ts`, `web/src/components/app/view-switch.tsx`
- Modify: `web/src/components/app/shell.tsx`, `web/src/components/app/more-sheet.tsx`, `web/src/app/teacher/layout.tsx`, `web/src/app/(student)/layout.tsx`, `web/src/app/account/layout.tsx`

Read `web/docs/brand-system.md` before styling.

- [ ] **Step 1: Write the server action** `switch-view.ts`

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SEAT_COOKIE, validSeat } from "@/lib/supabase/seat";

/** Into a seat this login owns, or back (`null`). No maxAge: the cookie ends
 *  with the browser session, so the default stays the teacher's own class. */
export async function switchView(seatId: string | null): Promise<void> {
  const store = await cookies();
  if (seatId === null) {
    store.delete(SEAT_COOKIE);
    redirect("/teacher/home");
  }
  const seat = validSeat(seatId);
  if (!seat) throw new Error("Unknown view.");
  const db = await supabaseServer({ asLogin: true });
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) throw new Error("Sign in first.");
  const { data } = await db.from("profiles").select("id").eq("id", seat).eq("login_id", userId).maybeSingle();
  if (!data) throw new Error("Unknown view.");
  store.set(SEAT_COOKIE, seat, { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect("/home");
}
```

The cookie isn't `httpOnly`, because the browser client reads it. It grants nothing.

- [ ] **Step 2: Write `view-switch.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { ArrowLeftRight } from "lucide-react";
import { switchView } from "@/lib/account/switch-view";
import { cn } from "@/lib/utils";

export type ViewSwitchTarget = { seatId: string | null; label: string };

/** Teacher to Esteemed Ustadhs and back. Rendered only for a login with a seat. */
export function ViewSwitch({ target, className }: { target: ViewSwitchTarget; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => switchView(target.seatId))}
      className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-sm disabled:opacity-50", className)}
    >
      <ArrowLeftRight className="size-[15px] shrink-0" aria-hidden />
      <span>{pending ? "Switching…" : target.label}</span>
    </button>
  );
}
```

- [ ] **Step 3: Wire up the shell**

Add `viewSwitch?: ViewSwitchTarget` to `AppShell` and `MoreTab` props. Render `<ViewSwitch target={viewSwitch} />` directly above `.foot` in the rail, and directly under the account link in the More sheet. Pass it from `AppShell` to `MoreTab`.

- [ ] **Step 4: Work out the target in the layouts**

`teacher/layout.tsx`:
```tsx
const db = await supabaseServer();
const { data: seat } = await db.from("profiles").select("id").eq("login_id", profile.id).maybeSingle();
// on AppShell:
viewSwitch={seat ? { seatId: seat.id, label: "Esteemed Ustadhs" } : undefined}
```

`(student)/layout.tsx` and `account/layout.tsx`, when `profile.login_id` is set:
```tsx
viewSwitch={profile.login_id ? { seatId: null, label: "Back to my class" } : undefined}
```

- [ ] **Step 5: Run tests and tsc, then commit.**

### Task 10: Localhost preview, then release

- [ ] Run `npm run dev --prefix web` from the worktree. In a browser, as a teacher with a seat, check on desktop and at 390px:
  - Opens on their own class. Switch appears, and no other teacher has it.
  - Switching shows the student dashboard with empty courses and homework, and an empty Resources page with its message.
  - Hifdh shows the partner once paired, and every surah in range can be picked.
  - A review session can be started and submitted, and the partner sees it.
  - Switching back returns to the teacher's class with nothing changed.
  - A fresh browser session opens on the teacher's own class.
- [ ] Test with a temporary pair, then retire the pair and delete the test session.
- [ ] Hand the owner the localhost link and wait for approval.
- [ ] After approval: test, build, heads-up, rebase, push to `main`, and confirm in a browser.

### Task 11: Mohamed's login email

- [ ] Dry run, read the copy: `cd web && npx tsx ../execution/send_invites.ts --email elbayouk62@gmail.com`
- [ ] Expected: non-admin copy, class Esteemed Ustadhs, 5 students. `tsx` runs from `web/` as the script's header says.
- [ ] Send with `--commit`, then tell the owner it went.

### Task 12: Close out

- [ ] Add to `LEARNINGS.md`: new rules use `acting_id()`, not `auth.uid()`; storage policies and finance functions are deliberate exceptions; the kill switch.
- [ ] Add a `project` memory for this class: seats, what's still basic, the follow-ups below.
- [ ] Remove the worktree when merged.

## Follow-ups to raise with the owner, not built here

- Resources has no add screen. New material goes in by migration until one is built.
- Peer review only reaches mushaf pages 562–604, which is Juz 29–30 (`FIRST_FONT_PAGE` in `review-tab.tsx`).
- `started_at` and `submitted_at` give a session's length, but no screen shows it yet, and sessions record no portion name.
- Pairs are one active pair per student, so with five students one always sits out unless Mohamed rotates them.
- Seats can't record voice notes, because storage rules stay on the login. Needs changing if this class gets voice homework.
