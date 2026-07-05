-- 0002_rls.sql — Row Level Security (ARCHITECTURE.md §4 "RLS highlights", §10 guardrail).
--
-- Principle: the client (anon key) can only ever touch its own rows + public-by-design
-- data (approved tutors, their availability, approved reviews). Everything trust-sensitive
-- — creating bookings, capturing payments, approving tutors, moderating reviews, awarding
-- referral bonuses — is done by Edge Functions with the SERVICE ROLE, which bypasses RLS.
-- So those tables intentionally have NO client write policies here.

-- ---------- helpers (SECURITY DEFINER to avoid RLS recursion) ----------
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function is_approved_tutor(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tutor_profiles where user_id = uid and approval_status = 'approved');
$$;

create or replace function is_conversation_participant(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = cid and (c.student_id = auth.uid() or c.tutor_id = auth.uid())
  );
$$;

-- ---------- enable RLS ----------
alter table users                  enable row level security;
alter table user_roles             enable row level security;
alter table tutor_profiles         enable row level security;
alter table ambassador_profiles    enable row level security;
alter table referrals              enable row level security;
alter table bookings               enable row level security;
alter table referral_bonuses       enable row level security;
alter table conversations          enable row level security;
alter table messages               enable row level security;
alter table reviews                enable row level security;
alter table tutor_availability     enable row level security;
alter table availability_overrides enable row level security;
alter table push_tokens            enable row level security;

-- ---------- users ----------
-- own row, any approved tutor (for browsing), or admin.
create policy users_select on users for select to authenticated
  using (id = auth.uid() or is_approved_tutor(id) or is_admin());
create policy users_update on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- inserts happen via the handle_new_user trigger (0003, SECURITY DEFINER).

-- ---------- user_roles ----------
create policy user_roles_select on user_roles for select to authenticated
  using (user_id = auth.uid() or is_admin());
-- a user may grant themselves student/tutor/ambassador ("Become a tutor"), never admin.
create policy user_roles_insert on user_roles for insert to authenticated
  with check (user_id = auth.uid() and role <> 'admin');
create policy user_roles_delete on user_roles for delete to authenticated
  using ((user_id = auth.uid() and role <> 'admin') or is_admin());

-- ---------- tutor_profiles ----------
create policy tutor_profiles_select on tutor_profiles for select to authenticated
  using (user_id = auth.uid() or approval_status = 'approved' or is_admin());
create policy tutor_profiles_insert on tutor_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy tutor_profiles_update on tutor_profiles for update to authenticated
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());
-- NOTE: approval_status / reviewed_by are meant to change only via the approve-tutor Edge
-- Function (service role). RLS is row-level, not column-level, so a hardening trigger that
-- rejects client-side approval_status changes is a TODO (§5 approve-tutor).

-- ---------- ambassador_profiles ----------
create policy ambassador_profiles_select on ambassador_profiles for select to authenticated
  using (user_id = auth.uid() or is_admin());
create policy ambassador_profiles_insert on ambassador_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy ambassador_profiles_update on ambassador_profiles for update to authenticated
  using (user_id = auth.uid() or is_admin()) with check (user_id = auth.uid() or is_admin());

-- ---------- referrals (read own; created by service role at signup) ----------
create policy referrals_select on referrals for select to authenticated
  using (ambassador_id = auth.uid() or referred_user_id = auth.uid() or is_admin());

-- ---------- bookings (read own; all writes via Edge Functions) ----------
create policy bookings_select on bookings for select to authenticated
  using (student_id = auth.uid() or tutor_id = auth.uid() or is_admin());

-- ---------- referral_bonuses (read own; written by service role) ----------
create policy referral_bonuses_select on referral_bonuses for select to authenticated
  using (ambassador_id = auth.uid() or is_admin());

-- ---------- conversations (participants; student initiates) ----------
create policy conversations_select on conversations for select to authenticated
  using (student_id = auth.uid() or tutor_id = auth.uid() or is_admin());
create policy conversations_insert on conversations for insert to authenticated
  with check (student_id = auth.uid());

-- ---------- messages (participants read; sender writes) ----------
create policy messages_select on messages for select to authenticated
  using (is_conversation_participant(conversation_id) or is_admin());
create policy messages_insert on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_conversation_participant(conversation_id));

-- ---------- reviews (approved visible to all; own visible to author; moderated by service role) ----------
create policy reviews_select on reviews for select to authenticated
  using (approval_status = 'approved' or reviewer_id = auth.uid() or is_admin());

-- ---------- tutor_availability (anyone authenticated reads; tutor manages own) ----------
create policy tutor_availability_select on tutor_availability for select to authenticated
  using (true);
create policy tutor_availability_write on tutor_availability for all to authenticated
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- ---------- availability_overrides (same shape as availability) ----------
create policy availability_overrides_select on availability_overrides for select to authenticated
  using (true);
create policy availability_overrides_write on availability_overrides for all to authenticated
  using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- ---------- push_tokens (own only) ----------
create policy push_tokens_all on push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
