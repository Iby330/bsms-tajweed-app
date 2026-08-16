-- Profile pictures.
--
-- Optional, and only ever set by the person themselves during account setup or
-- from /account afterwards.
--
-- The bucket is PRIVATE. A public bucket serves any object to anyone holding
-- the path, and this app carries photographs of people including minors, so
-- reads go through a short-lived signed URL minted server-side instead. The
-- pages that show an avatar are server-rendered anyway, so that costs nothing.
--
-- Objects live under a folder named for the owner's user id — the same shape
-- the voice-notes bucket already uses, so the policies read the same way.

alter table profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', false,
  2 * 1024 * 1024,                                   -- 2 MB is plenty for a face
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public            = excluded.public;

drop policy if exists av_own_read   on storage.objects;
drop policy if exists av_own_insert on storage.objects;
drop policy if exists av_own_update on storage.objects;
drop policy if exists av_own_delete on storage.objects;

-- Anyone signed in may READ an avatar: teachers see their students on the
-- register, students see their teacher. Writing is confined to your own folder,
-- so nobody can replace someone else's picture.
create policy av_own_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy av_own_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy av_own_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy av_own_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

insert into schema_migrations (filename) values ('0016_profile_avatars.sql')
  on conflict do nothing;
