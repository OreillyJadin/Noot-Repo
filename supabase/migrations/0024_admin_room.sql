-- 0024_admin_room.sql — a single group thread for the admin team.
--
-- DESIGN: this reuses `conversations` rather than adding a parallel admin-messages table.
-- `messages`, `message_attachments`, the chat-attachments bucket, the Realtime publication
-- and the whole @noot/core chat API then work unchanged — attachments and live delivery come
-- for free instead of being reimplemented and drifting.
--
-- Membership is implicit: you are in the room iff you hold the admin role. There is no
-- per-room member list to keep in sync with user_roles, so granting/revoking admin adds and
-- removes someone from the thread automatically.

-- ---------- widen conversations to two shapes ----------
alter table conversations add column if not exists kind text not null default 'direct';

alter table conversations drop constraint if exists conversations_kind_check;
alter table conversations add constraint conversations_kind_check check (kind in ('direct', 'admin'));

-- The 1:1 columns are meaningless for a group room.
alter table conversations alter column student_id drop not null;
alter table conversations alter column tutor_id drop not null;

-- ...but a 'direct' row must still have both, so nullability can't be abused.
alter table conversations drop constraint if exists conversations_shape_check;
alter table conversations add constraint conversations_shape_check check (
  (kind = 'direct' and student_id is not null and tutor_id is not null)
  or (kind = 'admin' and student_id is null and tutor_id is null)
);

-- The 0001 `unique (student_id, tutor_id)` can't enforce this: in Postgres NULLs are distinct,
-- so (null, null) could repeat forever. One admin room, enforced.
create unique index if not exists conversations_single_admin_room
  on conversations (kind) where kind = 'admin';

-- Fixed id so every environment refers to the same room and the client can look it up by kind.
insert into conversations (id, kind, student_id, tutor_id)
values ('00000000-0000-0000-0000-0000000000ad', 'admin', null, null)
on conflict (id) do nothing;

-- ---------- authorization ----------
-- Both helpers gain the admin-room branch. Everything downstream — messages_select,
-- messages_insert, the message_attachments policies (0021) and the Storage policies — routes
-- through these two, so this is the only place the new membership rule is expressed.
create or replace function is_conversation_participant(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id = cid
      and (
        (c.kind = 'direct' and (c.student_id = auth.uid() or c.tutor_id = auth.uid()))
        or (c.kind = 'admin' and is_admin())
      )
  );
$$;

create or replace function public.is_chat_attachment_participant(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id::text = split_part(object_name, '/', 1)
      and (
        (c.kind = 'direct' and (c.student_id = auth.uid() or c.tutor_id = auth.uid()))
        or (c.kind = 'admin' and is_admin())
      )
  );
$$;

-- NOTE: conversations_select (0002) already ends in `or is_admin()`, so admins can read the
-- room row itself without a policy change. It stays out of everyone's chat list because
-- listConversations filters on student_id/tutor_id, which are null here.
