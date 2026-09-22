-- ═══════════════════════════════════════════════════════════════════════
-- The Resend API key, read from Supabase Vault.
--
-- WHY IT LIVES HERE. The Netlify site belongs to an account only one person
-- can administer (free plan, one member), so adding an env var there waits on
-- them. The repo is PUBLIC, so the key can never go in code. Vault is
-- encrypted at rest, and the app already holds the service-role key in
-- production, so this is a way in that needs neither.
--
-- lib/email/send.ts prefers process.env.RESEND_API_KEY when it is set and
-- falls back to this, so moving the key to Netlify later needs no code change.
--
-- The key itself is NOT in this file. It is put into Vault by hand, in the
-- Supabase dashboard's SQL editor:
--
--   select vault.create_secret('re_...', 'resend_api_key');
--
-- and rotated with vault.update_secret(<id>, 're_new...').
--
-- WHO CAN READ IT: the service role only. Execute is revoked from public,
-- anon and authenticated, so neither the open internet nor a signed-in
-- student can call this through PostgREST.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.resend_api_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'resend_api_key'
  order by created_at desc
  limit 1
$$;

revoke all on function public.resend_api_key() from public, anon, authenticated;
grant execute on function public.resend_api_key() to service_role;

comment on function public.resend_api_key() is
  'The Resend key from Vault, service role only. See migration 0036.';
