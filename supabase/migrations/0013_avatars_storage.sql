-- 0013_avatars_storage.sql — public Storage bucket for profile photos (avatars).
-- Unlike transcripts (private), avatars are shown on public tutor cards / profiles, so
-- the bucket is PUBLIC (readable via CDN link). Writes are still owner-scoped: a user may
-- upload/overwrite only files under their own {uid}/ folder. The resolved public URL is
-- recorded on users.avatar_url.

alter table users add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone may read avatars (public bucket — also served via the public object URL).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

-- Owner may upload into their own folder ({uid}/...).
drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owner may overwrite their own file.
drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owner may delete their own file.
drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
