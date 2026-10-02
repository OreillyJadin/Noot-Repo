-- 0039_student_tutor_walls.sql — close the two ways a plain student could act as a tutor.
--
-- Found by probing as a fresh student with only the anon key + their own JWT (a modified
-- client), 2026-10-02. The application flow itself held: a draft can't reach the admin queue
-- or search, and every server-owned tutor_profiles field is guarded (0038). Two older
-- 0002 policies predate that model:
--
--   1. user_roles_insert let a user grant themselves ANY role but admin, so a student could
--      insert role 'tutor' and then set users.active_role = 'tutor' (0007 only checks that
--      the role is held). approve-tutor has been the only writer of the tutor role since
--      0038 (the app never calls addRole('tutor')), but RLS never enforced that. Admins'
--      user list then showed an unreviewed student as a tutor.
--   2. conversations_insert only checked student_id = me, so a student could open a "tutor"
--      chat with ANY user (another student, a rejected or draft applicant) and message them.
--      The victim saw it in their inbox as if they were the tutor.
--
-- Checked against production 2026-10-02 (read-only): both 0002 policies still live there; all
-- 4 tutor roles belong to approved tutors, no unapproved user is in tutor mode, and all 4
-- direct chats are with approved tutors — so the cleanup below changes 0 rows and no existing
-- chat would have failed the new insert check.

-- ---------- 1. user_roles: self-serve is ambassador only ----------
-- 'student' is granted at signup by handle_new_user (SECURITY DEFINER), 'tutor' by
-- approve-tutor (service role), 'admin' by hand. Ambassador is the only opt-in role.
drop policy if exists user_roles_insert on user_roles;
create policy user_roles_insert on user_roles for insert to authenticated
  with check (user_id = auth.uid() and role = 'ambassador');

drop policy if exists user_roles_delete on user_roles;
create policy user_roles_delete on user_roles for delete to authenticated
  using ((user_id = auth.uid() and role = 'ambassador') or is_admin());

-- Drop tutor roles that no approval backs (self-granted through the old policy). Leave
-- tutor mode first: 0007 rejects an active_role the user no longer holds.
update users u
   set active_role = 'student'
 where u.active_role = 'tutor'
   and not is_approved_tutor(u.id);
delete from user_roles r
 where r.role = 'tutor'
   and not is_approved_tutor(r.user_id);

-- ---------- 2. conversations: a student may only open a chat with an approved tutor ----------
-- The admin room (kind 'admin') is created server-side; clients only ever open 'direct'.
drop policy if exists conversations_insert on conversations;
create policy conversations_insert on conversations for insert to authenticated
  with check (
    kind = 'direct'
    and student_id = auth.uid()
    and tutor_id <> auth.uid()
    and is_approved_tutor(tutor_id)
  );
