create or replace function public.guard_message_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_prefix text;
  v_allowed_mime_types text[];
  v_file_size_limit bigint;
begin
  if tg_op = 'UPDATE'
     and auth.role() in ('anon', 'authenticated')
     and (
       new.storage_path is distinct from old.storage_path
       or new.message_id is distinct from old.message_id
     ) then
    raise exception 'Attachment path and message cannot be changed'
      using errcode = '23514';
  end if;

  select m.conversation_id
    into v_conversation_id
    from public.messages m
   where m.id = new.message_id;

  if not found or v_conversation_id is null then
    raise exception 'Attachment message does not exist'
      using errcode = '23514';
  end if;

  v_prefix := v_conversation_id::text || '/';
  if new.storage_path is null
     or left(new.storage_path, char_length(v_prefix)) <> v_prefix
     or position('..' in new.storage_path) > 0 then
    raise exception 'Attachment path must belong to its conversation'
      using errcode = '23514';
  end if;

  select b.allowed_mime_types, b.file_size_limit
    into v_allowed_mime_types, v_file_size_limit
    from storage.buckets b
   where b.id = 'chat-attachments';

  if not found
     or v_allowed_mime_types is null
     or new.mime_type is null
     or not (new.mime_type = any(v_allowed_mime_types)) then
    raise exception 'Attachment MIME type is not allowed'
      using errcode = '23514';
  end if;

  if new.kind is null
     or new.kind not in ('image', 'file')
     or (new.kind = 'image') is distinct from (new.mime_type like 'image/%') then
    raise exception 'Attachment kind does not match its MIME type'
      using errcode = '23514';
  end if;

  if new.size_bytes is not null
     and (
       new.size_bytes < 1
       or v_file_size_limit is null
       or new.size_bytes > v_file_size_limit
     ) then
    raise exception 'Attachment size is outside the bucket limit'
      using errcode = '23514';
  end if;

  if new.filename is null or char_length(new.filename) not between 1 and 200 then
    raise exception 'Attachment filename must be between 1 and 200 characters'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_message_attachment() from public, anon, authenticated;

create trigger message_attachments_guard_metadata
  before insert or update on public.message_attachments
  for each row execute function public.guard_message_attachment();
