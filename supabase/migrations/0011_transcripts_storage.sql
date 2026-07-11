-- 0011_transcripts_storage.sql — private Storage bucket for tutor transcripts (Phase 2).
-- Transcripts are sensitive (the onboarding copy promises "we never share your transcript"),
-- so the bucket is PRIVATE and access is scoped: a tutor may write/read only files under
-- their own {uid}/ folder; admins may read any (for the approval queue). Everyone reads via
-- short-lived signed URLs — never public links.

insert into storage.buckets (id, name, public)
values ('transcripts', 'transcripts', false)
on conflict (id) do nothing;

-- Owner may upload into their own folder ({uid}/...).
drop policy if exists "transcripts_owner_insert" on storage.objects;
create policy "transcripts_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owner may overwrite their own file.
drop policy if exists "transcripts_owner_update" on storage.objects;
create policy "transcripts_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owner reads their own; admins read any (for review). Signed URLs are minted from these.
drop policy if exists "transcripts_owner_or_admin_read" on storage.objects;
create policy "transcripts_owner_or_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'transcripts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
