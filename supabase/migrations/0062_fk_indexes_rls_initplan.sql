-- Performance advisor hygiene (no behaviour change).
--
-- 1. unindexed_foreign_keys: a covering index for every public foreign key that had none,
--    so deletes/updates on the referenced row and joins on the FK don't seq-scan.
-- 2. auth_rls_initplan: RLS policies called auth.uid() once per row. Wrapping the call as
--    (select auth.uid()) makes Postgres evaluate it once per statement (an initPlan).
--    Each ALTER POLICY below restates the policy's existing expression exactly as
--    pg_policies deparses it, with only the auth.* calls wrapped. ALTER POLICY keeps the
--    name, command, roles and permissive/restrictive mode; a clause it doesn't mention
--    (USING or WITH CHECK) is left as is. Names are schema-qualified so the result doesn't
--    depend on the migration runner's search_path.
--
-- New policies should be written with (select auth.uid()) from the start.

-- 1. Foreign-key covering indexes -----------------------------------------------------

create index if not exists ambassador_approvals_approved_by_idx on public.ambassador_approvals (approved_by);  -- ambassador_approvals_approved_by_fkey
create index if not exists blocked_signup_emails_user_id_idx on public.blocked_signup_emails (user_id);  -- blocked_signup_emails_user_id_fkey
create index if not exists bookings_reschedule_proposed_by_idx on public.bookings (reschedule_proposed_by);  -- bookings_reschedule_proposed_by_fkey
create index if not exists content_reports_reporter_id_idx on public.content_reports (reporter_id);  -- content_reports_reporter_id_fkey
create index if not exists content_reports_reviewed_by_idx on public.content_reports (reviewed_by);  -- content_reports_reviewed_by_fkey
create index if not exists content_reports_target_review_id_idx on public.content_reports (target_review_id);  -- content_reports_target_review_id_fkey
create index if not exists content_reports_target_user_id_idx on public.content_reports (target_user_id);  -- content_reports_target_user_id_fkey
create index if not exists conversations_tutor_id_idx on public.conversations (tutor_id);  -- conversations_tutor_id_fkey
create index if not exists credit_ledger_booking_id_idx on public.credit_ledger (booking_id);  -- credit_ledger_booking_id_fkey
create index if not exists messages_sender_id_idx on public.messages (sender_id);  -- messages_sender_id_fkey
create index if not exists referral_bonuses_ambassador_id_idx on public.referral_bonuses (ambassador_id);  -- referral_bonuses_ambassador_id_fkey
create index if not exists referral_bonuses_triggering_booking_id_idx on public.referral_bonuses (triggering_booking_id);  -- referral_bonuses_triggering_booking_id_fkey
create index if not exists reviews_reviewed_by_idx on public.reviews (reviewed_by);  -- reviews_reviewed_by_fkey
create index if not exists reviews_reviewer_id_idx on public.reviews (reviewer_id);  -- reviews_reviewer_id_fkey
create index if not exists saved_tutors_tutor_id_idx on public.saved_tutors (tutor_id);  -- saved_tutors_tutor_id_fkey
create index if not exists session_reminders_sent_user_id_idx on public.session_reminders_sent (user_id);  -- session_reminders_sent_user_id_fkey
create index if not exists tutor_interviews_scheduled_by_idx on public.tutor_interviews (scheduled_by);  -- tutor_interviews_scheduled_by_fkey
create index if not exists tutor_profiles_grades_verified_by_idx on public.tutor_profiles (grades_verified_by);  -- tutor_profiles_grades_verified_by_fkey
create index if not exists tutor_profiles_reviewed_by_idx on public.tutor_profiles (reviewed_by);  -- tutor_profiles_reviewed_by_fkey

-- 2. RLS policies: evaluate auth.uid() once per statement -----------------------------

alter policy ambassador_approvals_select on public.ambassador_approvals
  using (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy ambassador_profiles_insert on public.ambassador_profiles
  with check ((user_id = (select auth.uid())));

alter policy ambassador_profiles_select on public.ambassador_profiles
  using (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy ambassador_profiles_update on public.ambassador_profiles
  using (((user_id = (select auth.uid())) OR public.is_admin()))
  with check (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy analytics_events_insert_own on public.analytics_events
  with check ((user_id = (select auth.uid())));

alter policy availability_overrides_write on public.availability_overrides
  using ((tutor_id = (select auth.uid())))
  with check ((tutor_id = (select auth.uid())));

alter policy bookings_select on public.bookings
  using (((student_id = (select auth.uid())) OR (tutor_id = (select auth.uid())) OR public.is_admin()));

alter policy content_reports_insert on public.content_reports
  with check ((reporter_id = (select auth.uid())));

alter policy content_reports_select on public.content_reports
  using (((reporter_id = (select auth.uid())) OR public.is_admin()));

alter policy conversations_insert on public.conversations
  with check (((kind = 'direct'::text) AND (student_id = (select auth.uid())) AND (tutor_id <> (select auth.uid())) AND public.is_approved_tutor(tutor_id)));

alter policy conversations_select on public.conversations
  using (((student_id = (select auth.uid())) OR (tutor_id = (select auth.uid())) OR public.is_admin()));

alter policy credit_cashouts_select on public.credit_cashouts
  using (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy credit_ledger_select on public.credit_ledger
  using (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy invite_codes_select on public.invite_codes
  using (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy message_attachments_insert on public.message_attachments
  with check ((EXISTS ( SELECT 1
   FROM public.messages m
  WHERE ((m.id = message_attachments.message_id) AND (m.sender_id = (select auth.uid()))))));

alter policy messages_insert on public.messages
  with check (((sender_id = (select auth.uid())) AND public.is_conversation_participant(conversation_id) AND (NOT (EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND (c.kind = 'direct'::text) AND public.is_blocked_between(c.student_id, c.tutor_id)))))));

alter policy notifications_delete_own on public.notifications
  using ((user_id = (select auth.uid())));

alter policy notifications_select_own on public.notifications
  using ((user_id = (select auth.uid())));

alter policy notifications_update_own on public.notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy push_tokens_all on public.push_tokens
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy referral_bonuses_select on public.referral_bonuses
  using (((ambassador_id = (select auth.uid())) OR public.is_admin()));

alter policy referrals_select on public.referrals
  using (((ambassador_id = (select auth.uid())) OR (referred_user_id = (select auth.uid())) OR public.is_admin()));

alter policy reminder_preferences_insert_own on public.reminder_preferences
  with check ((user_id = (select auth.uid())));

alter policy reminder_preferences_select_own on public.reminder_preferences
  using ((user_id = (select auth.uid())));

alter policy reminder_preferences_update_own on public.reminder_preferences
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy reviews_select on public.reviews
  using (((approval_status = 'approved'::public.approval_status) OR (reviewer_id = (select auth.uid())) OR public.is_admin()));

alter policy saved_tutors_all on public.saved_tutors
  using ((student_id = (select auth.uid())))
  with check ((student_id = (select auth.uid())));

alter policy tutor_availability_write on public.tutor_availability
  using ((tutor_id = (select auth.uid())))
  with check ((tutor_id = (select auth.uid())));

alter policy tutor_courses_write on public.tutor_courses
  using ((tutor_id = (select auth.uid())))
  with check ((tutor_id = (select auth.uid())));

alter policy tutor_interviews_select on public.tutor_interviews
  using (((tutor_id = (select auth.uid())) OR public.is_admin()));

alter policy tutor_profiles_insert on public.tutor_profiles
  with check ((user_id = (select auth.uid())));

alter policy tutor_profiles_select on public.tutor_profiles
  using (((user_id = (select auth.uid())) OR (approval_status = 'approved'::public.approval_status) OR public.is_admin()));

alter policy tutor_profiles_update on public.tutor_profiles
  using (((user_id = (select auth.uid())) OR public.is_admin()))
  with check (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy user_blocks_delete on public.user_blocks
  using ((blocker_id = (select auth.uid())));

alter policy user_blocks_insert on public.user_blocks
  with check ((blocker_id = (select auth.uid())));

alter policy user_blocks_select on public.user_blocks
  using (((blocker_id = (select auth.uid())) OR public.is_admin()));

alter policy user_roles_delete on public.user_roles
  using ((((user_id = (select auth.uid())) AND (role = 'ambassador'::public.user_role)) OR public.is_admin()));

alter policy user_roles_insert on public.user_roles
  with check (((user_id = (select auth.uid())) AND (role = 'ambassador'::public.user_role)));

alter policy user_roles_select on public.user_roles
  using (((user_id = (select auth.uid())) OR public.is_admin()));

alter policy users_select on public.users
  using (((id = (select auth.uid())) OR public.is_approved_tutor(id) OR public.is_admin()));

alter policy users_update on public.users
  using ((id = (select auth.uid())))
  with check ((id = (select auth.uid())));

-- storage.objects policies from our own migrations (avatars and transcripts buckets)

alter policy avatars_owner_delete on storage.objects
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));

alter policy avatars_owner_insert on storage.objects
  with check (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));

alter policy avatars_owner_update on storage.objects
  using (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));

alter policy transcripts_owner_delete on storage.objects
  using (((bucket_id = 'transcripts'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.tutor_grades_verified((select auth.uid())))));

alter policy transcripts_owner_insert on storage.objects
  with check (((bucket_id = 'transcripts'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.tutor_grades_verified((select auth.uid())))));

alter policy transcripts_owner_or_admin_read on storage.objects
  using (((bucket_id = 'transcripts'::text) AND (((storage.foldername(name))[1] = ((select auth.uid()))::text) OR public.is_admin())));

alter policy transcripts_owner_update on storage.objects
  using (((bucket_id = 'transcripts'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.tutor_grades_verified((select auth.uid())))));
