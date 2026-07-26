-- 0017_transcripts_owner_delete.sql — let a tutor delete their own transcript.
-- 0011 gave the transcripts bucket insert/update/select policies but no delete, so replacing
-- a transcript left the previous file behind in Storage forever — an unwanted second copy of
-- a document the onboarding copy promises we keep private. api.profile.uploadTranscript now
-- clears the old file after a successful upload, which needs this policy. Scoped the same way
-- as the others: only files under the caller's own {uid}/ folder. Mirrors avatars (0013).

drop policy if exists "transcripts_owner_delete" on storage.objects;
create policy "transcripts_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text);
