-- 0021_chat_attachments.sql — message attachments, deferred back in 0001 (see the NOTE under
-- the messages table). Adds the table, a private Storage bucket, and an atomic send RPC.
--
-- ACCESS MODEL: an attachment is exactly as private as the conversation it belongs to. Both
-- the table policies and the Storage policies resolve back to is_conversation_participant()
-- (0002), so there is one definition of "may see this thread" rather than two that can drift.
-- The bucket is PRIVATE — clients read through short-lived signed URLs, never public links.

-- ---------- table ----------
create table if not exists message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references messages(id) on delete cascade,
  storage_path text not null,
  kind         text not null check (kind in ('image', 'file')),
  filename     text not null,
  size_bytes   bigint,
  mime_type    text,
  created_at   timestamptz not null default now()
);
create index if not exists message_attachments_message_idx on message_attachments (message_id);

-- Denormalized count so the realtime path and the chat-list preview can tell an
-- attachment-only message from an empty one without a second query per message.
alter table messages add column if not exists attachment_count int not null default 0;

alter table message_attachments enable row level security;

-- Participants (and admins) read; only the message's own sender writes.
drop policy if exists message_attachments_select on message_attachments;
create policy message_attachments_select on message_attachments for select to authenticated
  using (exists (
    select 1 from messages m
    where m.id = message_id and (is_conversation_participant(m.conversation_id) or is_admin())
  ));

drop policy if exists message_attachments_insert on message_attachments;
create policy message_attachments_insert on message_attachments for insert to authenticated
  with check (exists (
    select 1 from messages m where m.id = message_id and m.sender_id = auth.uid()
  ));

-- ---------- storage ----------
-- Objects are keyed {conversation_id}/{unique}-{filename}, so the first path segment is the
-- authorization subject. Compared as text (never cast to uuid) so a malformed key is simply
-- "not yours" instead of raising 22P02 out of a policy.
create or replace function public.is_chat_attachment_participant(object_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations c
    where c.id::text = split_part(object_name, '/', 1)
      and (c.student_id = auth.uid() or c.tutor_id = auth.uid())
  );
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-attachments', 'chat-attachments', false, 10485760)  -- 10 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "chat_attachments_participant_read" on storage.objects;
create policy "chat_attachments_participant_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and public.is_chat_attachment_participant(name));

drop policy if exists "chat_attachments_participant_insert" on storage.objects;
create policy "chat_attachments_participant_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and public.is_chat_attachment_participant(name));

-- No delete policy on purpose: either participant could otherwise erase the other's file.
-- A failed send can leave an orphaned object, which is harmless and unreachable.

-- ---------- atomic send ----------
-- The message row and its attachment rows must land in ONE transaction. Realtime emits from
-- the WAL post-commit, so a subscriber that reacts to the message INSERT is guaranteed to see
-- the attachments already committed — inserting them in separate statements from the client
-- would race, and the receiver would render a message with its attachments missing.
--
-- SECURITY INVOKER (the default — deliberately not definer): both inserts stay subject to the
-- RLS policies above, so this is a convenience wrapper, not a privilege escalation.
create or replace function public.send_message_with_attachments(
  p_conversation_id uuid,
  p_content text,
  p_attachments jsonb default '[]'::jsonb
) returns messages
language plpgsql as $$
declare
  m messages;
  atts jsonb := coalesce(p_attachments, '[]'::jsonb);
begin
  if jsonb_typeof(atts) <> 'array' then
    raise exception 'p_attachments must be a JSON array';
  end if;

  insert into messages (conversation_id, sender_id, content, attachment_count)
  values (p_conversation_id, auth.uid(), coalesce(p_content, ''), jsonb_array_length(atts))
  returning * into m;

  insert into message_attachments (message_id, storage_path, kind, filename, size_bytes, mime_type)
  select m.id,
         a ->> 'storagePath',
         a ->> 'kind',
         a ->> 'filename',
         nullif(a ->> 'sizeBytes', '')::bigint,
         nullif(a ->> 'mimeType', '')
  from jsonb_array_elements(atts) a;

  return m;
end;
$$;

grant execute on function public.send_message_with_attachments(uuid, text, jsonb) to authenticated;
grant execute on function public.is_chat_attachment_participant(text) to authenticated;
