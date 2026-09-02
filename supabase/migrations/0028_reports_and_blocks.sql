-- 0028_reports_and_blocks.sql — report content, block users.
--
-- App Store Guideline 1.2 requires apps with user-generated content to let people report
-- offensive content, block abusive users, and receive a timely response. noot has two kinds of
-- UGC (chat messages, tutor reviews) and had none of these controls — while /terms already
-- promised all three. This makes the promise true.
--
-- BLOCKING IS ENFORCED IN THE DATABASE, not just hidden in the UI. A client-side filter is
-- cosmetic: the blocked user could still post. The messages_insert policy below is extended so
-- a blocked pair physically cannot write into their shared conversation.

-- ---------- blocks ----------
create table if not exists user_blocks (
  blocker_id uuid not null references users(id) on delete cascade,
  blocked_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);
create index if not exists user_blocks_blocked_idx on user_blocks (blocked_id);

alter table user_blocks enable row level security;

-- You manage only your own block list, and you can only see your own.
drop policy if exists user_blocks_select on user_blocks;
create policy user_blocks_select on user_blocks for select to authenticated
  using (blocker_id = auth.uid() or is_admin());

drop policy if exists user_blocks_insert on user_blocks;
create policy user_blocks_insert on user_blocks for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists user_blocks_delete on user_blocks;
create policy user_blocks_delete on user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ---------- reports ----------
create table if not exists content_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references users(id) on delete cascade,
  target_kind   text not null check (target_kind in ('message', 'user', 'review')),
  -- Exactly one target is set, matching target_kind. set null on delete so a report survives
  -- the content being removed — the moderation record is the point.
  target_message_id uuid references messages(id) on delete set null,
  target_user_id    uuid references users(id) on delete set null,
  target_review_id  uuid references reviews(id) on delete set null,
  reason        text not null check (reason in ('spam', 'harassment', 'inappropriate', 'academic_dishonesty', 'other')),
  detail        text,
  status        text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  reviewed_by   uuid references users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists content_reports_open_idx on content_reports (created_at desc) where status = 'open';

alter table content_reports enable row level security;

-- Anyone signed in may report. You can read your own reports back (so the UI can say "already
-- reported"); admins read everything.
drop policy if exists content_reports_insert on content_reports;
create policy content_reports_insert on content_reports for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists content_reports_select on content_reports;
create policy content_reports_select on content_reports for select to authenticated
  using (reporter_id = auth.uid() or is_admin());

-- Only admins resolve a report. Deliberately no delete policy: a moderation trail should not
-- be erasable by either party.
drop policy if exists content_reports_update on content_reports;
create policy content_reports_update on content_reports for update to authenticated
  using (is_admin()) with check (is_admin());

-- ---------- enforcement ----------
-- Symmetric on purpose: if either side has blocked the other, neither can message. Blocking
-- someone should not leave you able to keep messaging them.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Replaces the 0002 messages_insert policy, adding the block check. Admin rooms are unaffected
-- (they have no 1:1 counterpart to be blocked by).
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and is_conversation_participant(conversation_id)
    and not exists (
      select 1 from conversations c
      where c.id = conversation_id
        and c.kind = 'direct'
        and public.is_blocked_between(c.student_id, c.tutor_id)
    )
  );

comment on table user_blocks is 'Blocking is symmetric and enforced by messages_insert — a blocked pair cannot write to their conversation.';
comment on table content_reports is 'Guideline 1.2 moderation queue. Reviewed via the admin panel; no delete policy so the trail survives.';
